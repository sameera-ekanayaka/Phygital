"""Financial scoring and explainability engine for credit dossier generation.

Computes DSCR, risk scores, NCGI eligibility, and produces deterministic
explainability notes, anomaly flags, and trilingual field-interview prompts
for loan-officer review.
"""

import logging
import statistics
from typing import List

from app.api.v1.ingest.schemas import ExtractedTransaction

logger = logging.getLogger(__name__)

# ── Constants ────────────────────────────────────────────────────────────────

_ANNUAL_INTEREST_RATE = 0.14  # 14 % p.a. flat
_MONTHLY_RATE = _ANNUAL_INTEREST_RATE / 12

# Risk-score component weights (must sum to 1.0)
_W_DSCR = 0.40
_W_CONFIDENCE = 0.30
_W_EXPENSE_RATIO = 0.30

# Anomaly detection thresholds
_LARGE_TX_MULTIPLIER = 3.0  # single tx > 3× median → flag
_LOW_CONFIDENCE_THRESHOLD = 0.5


# ── Core metrics ─────────────────────────────────────────────────────────────


def _emi(principal: float, monthly_rate: float, tenor_months: int) -> float:
    """Standard EMI formula: P * r * (1+r)^n / ((1+r)^n - 1)."""
    if principal <= 0 or tenor_months <= 0:
        return 0.0
    if monthly_rate == 0:
        return principal / tenor_months
    factor = (1 + monthly_rate) ** tenor_months
    return principal * monthly_rate * factor / (factor - 1)


def compute_financial_metrics(
    transactions: List[ExtractedTransaction],
    requested_loan_amount: float = 250_000.0,
    loan_tenor_months: int = 12,
    owner_demographics: dict | None = None,
) -> dict:
    """Derive key financial metrics from a list of extracted transactions.

    Args:
        transactions: Extracted financial line-items (one month assumed).
        requested_loan_amount: Loan principal the merchant is requesting.
        loan_tenor_months: Repayment period in months.

    Returns:
        A dict matching :class:`~app.api.v1.dossier.schemas.FinancialMetrics`.
    """
    # ── Aggregate cash-flows by type ─────────────────────────────────────
    monthly_revenue = sum(
        t.amount for t in transactions if t.transaction_type == "business_revenue"
    )
    monthly_operating_expense = sum(
        t.amount for t in transactions if t.transaction_type == "business_expense"
    )
    monthly_personal_drawings = sum(
        t.amount for t in transactions if t.transaction_type == "personal_expense"
    )

    net_operating_income = monthly_revenue - monthly_operating_expense

    # ── Debt service ─────────────────────────────────────────────────────
    monthly_debt_service = _emi(requested_loan_amount, _MONTHLY_RATE, loan_tenor_months)

    # ── DSCR ─────────────────────────────────────────────────────────────
    if monthly_debt_service > 0:
        dscr = net_operating_income / monthly_debt_service
    else:
        dscr = float("inf") if net_operating_income > 0 else 0.0

    # ── Recommended loan ceiling ─────────────────────────────────────────
    # Max loan where DSCR stays >= 1.25
    # EMI per unit principal = r*(1+r)^n / ((1+r)^n - 1)
    if _MONTHLY_RATE > 0 and loan_tenor_months > 0:
        factor = (1 + _MONTHLY_RATE) ** loan_tenor_months
        emi_per_unit = _MONTHLY_RATE * factor / (factor - 1)
        max_loan_dscr = net_operating_income / (1.25 * emi_per_unit) if emi_per_unit > 0 else 0.0
    else:
        max_loan_dscr = 0.0

    recommended_loan_ceiling = min(3.5 * net_operating_income, max_loan_dscr)
    recommended_loan_ceiling = max(recommended_loan_ceiling, 0.0)

    # ── NCGI eligibility ─────────────────────────────────────────────────
    if owner_demographics and owner_demographics.get("female_owned"):
        # NCGI Liya Shakthi: 80% guarantee for women-owned micro-enterprises
        ncgi_eligibility_percent = 80.0 if dscr > 0 else 0.0
    elif dscr >= 1.5:
        ncgi_eligibility_percent = 80.0
    elif dscr >= 1.25:
        ncgi_eligibility_percent = 75.0
    else:
        ncgi_eligibility_percent = 0.0

    # ── Operating margin ─────────────────────────────────────────────────
    operating_margin_percent = (
        (net_operating_income / monthly_revenue * 100) if monthly_revenue > 0 else 0.0
    )

    # ── Risk score (0-100) ───────────────────────────────────────────────
    # DSCR component: 100 if DSCR >= 2.0, linear 0-100 for 0..2
    dscr_component = min(dscr / 2.0, 1.0) * 100

    # Confidence component: average confidence × 100
    confidence_scores = [t.confidence_score for t in transactions]
    avg_confidence = statistics.mean(confidence_scores) if confidence_scores else 0.0
    confidence_component = avg_confidence * 100

    # Expense ratio component: lower is better; 100 when ratio=0, 0 when ratio>=1
    expense_ratio = (
        monthly_operating_expense / monthly_revenue if monthly_revenue > 0 else 1.0
    )
    expense_component = max(0.0, (1.0 - expense_ratio)) * 100

    risk_score = round(
        _W_DSCR * dscr_component
        + _W_CONFIDENCE * confidence_component
        + _W_EXPENSE_RATIO * expense_component,
        2,
    )
    risk_score = max(0.0, min(100.0, risk_score))

    metrics = {
        "monthly_revenue": round(monthly_revenue, 2),
        "monthly_operating_expense": round(monthly_operating_expense, 2),
        "monthly_personal_drawings": round(monthly_personal_drawings, 2),
        "net_operating_income": round(net_operating_income, 2),
        "monthly_debt_service": round(monthly_debt_service, 2),
        "dscr": round(dscr, 4) if dscr != float("inf") else 999.0,
        "recommended_loan_ceiling": round(recommended_loan_ceiling, 2),
        "ncgi_eligibility_percent": ncgi_eligibility_percent,
        "risk_score": risk_score,
        "operating_margin_percent": round(operating_margin_percent, 2),
    }

    logger.info(
        "Computed metrics: revenue=%.2f, NOI=%.2f, DSCR=%.4f, risk=%.2f",
        monthly_revenue,
        net_operating_income,
        dscr if dscr != float("inf") else 999.0,
        risk_score,
    )
    return metrics


# ── Explainability notes ─────────────────────────────────────────────────────


def generate_explainability_notes(
    metrics: dict,
    transactions: List[ExtractedTransaction],
    owner_demographics: dict | None = None,
) -> List[str]:
    """Produce deterministic, human-readable explanation points.

    Args:
        metrics: Output of :func:`compute_financial_metrics`.
        transactions: The original transaction list.
        owner_demographics: Optional dict with ``female_owned`` flag for NCGI Liya Shakthi.

    Returns:
        A list of plain-English bullet-style strings.
    """
    notes: List[str] = []

    # ── Agricultural pattern detection ────────────────────────────────────
    has_agricultural = any(
        "agricultural" in t.category.lower() or "harvest" in t.description.lower()
        for t in transactions
    )
    if has_agricultural:
        notes.append(
            "Consistent agricultural supply cycles detected — "
            "seasonal revenue patterns typical for agri-SMEs."
        )

    # ── NCGI Liya Shakthi eligibility note ────────────────────────────────
    if owner_demographics and owner_demographics.get("female_owned"):
        notes.append(
            "NCGI Liya Shakthi eligibility confirmed — "
            "80% credit guarantee for women-owned micro-enterprise."
        )

    margin = metrics["operating_margin_percent"]
    notes.append(f"Operating margin at {margin:.1f}% — {'healthy' if margin >= 20 else 'thin'} for a micro-SME.")

    dscr = metrics["dscr"]
    if dscr >= 1.5:
        notes.append(f"DSCR at {dscr:.2f} indicates strong debt-service coverage.")
    elif dscr >= 1.25:
        notes.append(f"DSCR at {dscr:.2f} indicates adequate but not robust coverage.")
    elif dscr >= 1.0:
        notes.append(f"DSCR at {dscr:.2f} is below the 1.25 threshold — heightened risk.")
    else:
        notes.append(f"DSCR at {dscr:.2f} signals insufficient cash-flow to service the requested debt.")

    # Revenue concentration
    revenue_txns = [t for t in transactions if t.transaction_type == "business_revenue"]
    if len(revenue_txns) >= 2:
        amounts = [t.amount for t in revenue_txns]
        cv = statistics.stdev(amounts) / statistics.mean(amounts) if statistics.mean(amounts) > 0 else 0
        if cv < 0.3:
            notes.append("Low volatility in daily sales — revenue stream appears stable.")
        else:
            notes.append("High volatility in sales amounts — revenue stream is uneven.")

    # Expense ratio
    exp_ratio = (
        metrics["monthly_operating_expense"] / metrics["monthly_revenue"] * 100
        if metrics["monthly_revenue"] > 0
        else 0
    )
    notes.append(f"Operating expenses represent {exp_ratio:.1f}% of revenue.")

    # Personal drawings
    drawings = metrics["monthly_personal_drawings"]
    if drawings > 0 and metrics["monthly_revenue"] > 0:
        draw_pct = drawings / metrics["monthly_revenue"] * 100
        notes.append(f"Personal drawings are {draw_pct:.1f}% of revenue — {'elevated' if draw_pct > 30 else 'within normal range'}.")

    # NCGI
    ncgi = metrics["ncgi_eligibility_percent"]
    if ncgi > 0:
        notes.append(f"NCGI coverage eligibility at {ncgi:.0f}% for informal SME guarantee scheme.")
    else:
        notes.append("Merchant does not currently qualify for NCGI coverage (DSCR below 1.25).")

    return notes


# ── Anomaly flags ────────────────────────────────────────────────────────────


def generate_anomaly_flags(
    transactions: List[ExtractedTransaction],
) -> List[str]:
    """Flag statistical outliers and low-confidence items.

    Args:
        transactions: The transaction list to inspect.

    Returns:
        A (possibly empty) list of human-readable anomaly descriptions.
    """
    flags: List[str] = []
    if not transactions:
        return flags

    # ── Large single-transaction outlier ─────────────────────────────────
    for tx_type in ("business_revenue", "business_expense", "personal_expense"):
        subset = [t for t in transactions if t.transaction_type == tx_type]
        if len(subset) < 3:
            continue
        amounts = [t.amount for t in subset]
        median_amt = statistics.median(amounts)
        if median_amt <= 0:
            continue
        for t in subset:
            if t.amount > median_amt * _LARGE_TX_MULTIPLIER:
                flags.append(
                    f"Unusually large {tx_type.replace('_', ' ')} item: "
                    f"LKR {t.amount:,.0f} ('{t.description}') — "
                    f"{t.amount / median_amt:.1f}× the median for its category."
                )

    # ── Low-confidence items ─────────────────────────────────────────────
    for t in transactions:
        if t.confidence_score < _LOW_CONFIDENCE_THRESHOLD:
            flags.append(
                f"Low-confidence transaction (score {t.confidence_score:.2f}): "
                f"'{t.description}' — recommend manual verification."
            )

    return flags


# ── Field-interview prompts ──────────────────────────────────────────────────


def generate_field_interview_prompts(
    metrics: dict,
    transactions: List[ExtractedTransaction],
) -> List[dict]:
    """Generate contextual verification questions for the loan officer.

    Each prompt includes both English and Sinhala translations so the officer
    can switch languages during the field visit.

    Args:
        metrics: Output of :func:`compute_financial_metrics`.
        transactions: Original transaction list (used for context).

    Returns:
        A list of dicts with ``english`` and ``sinhala`` keys.
    """
    categories = {t.category for t in transactions}
    prompts: List[dict] = []

    # Prompt 1 — supply chain / inventory sourcing
    prompts.append({
        "english": (
            "Ask the borrower where they source dry goods and verify the "
            "supplier credit cycle — are payments weekly or monthly?"
        ),
        "sinhala": (
            "ණයකරු වියළි භාණ්ඩ ලබා ගන්නේ කොහෙන්දැයි අසන්න සහ සැපයුම්කරුගේ "
            "ණය චක්‍රය තහවුරු කරන්න — ගෙවීම් සතිපතාද මාසිකවද?"
        ),
    })

    # Prompt 2 — transport / logistics verification
    has_transport = "transport" in categories or any(
        "lorry" in t.description.lower() or "hire" in t.description.lower()
        for t in transactions
    )
    if has_transport:
        prompts.append({
            "english": (
                "Verify the lorry hire frequency — is it weekly or per-order? "
                "Cross-check with the stated transport expenses."
            ),
            "sinhala": (
                "ලොරි කුලී සංඛ්‍යාතය තහවුරු කරන්න — එය සතිපතාද නැතහොත් "
                "ඇණවුම් පදනම මතද? ප්‍රවාහන වියදම් සමඟ හරස් පරීක්ෂා කරන්න."
            ),
        })
    else:
        prompts.append({
            "english": (
                "Confirm the monthly rent for the business premises and whether "
                "it is paid on time — ask for recent receipts."
            ),
            "sinhala": (
                "ව්‍යාපාරික ස්ථානයේ මාසික කුලිය තහවුරු කරන්න සහ එය නියමිත "
                "වේලාවට ගෙවනවාද — මෑත කුවිතාන් ඉල්ලන්න."
            ),
        })

    # Prompt 3 — government transfers / welfare
    has_samurdhi = any(
        "samurdhi" in t.description.lower() or "government" in t.description.lower()
        for t in transactions
    )
    if has_samurdhi:
        prompts.append({
            "english": (
                "Confirm monthly Samurdhi or government transfer amounts — "
                "verify against the National Secretariat records if possible."
            ),
            "sinhala": (
                "මාසික සමෘද්ධි හෝ රජයේ හුවමාරු මුදල් තහවුරු කරන්න — "
                "හැකි නම් ජාතික ලේකම් කාර්යාලයේ වාර්තා සමඟ සත්‍යාපනය කරන්න."
            ),
        })
    else:
        prompts.append({
            "english": (
                "Ask whether the borrower receives any government subsidies, "
                "Samurdhi payments, or other welfare transfers not yet recorded."
            ),
            "sinhala": (
                "ණයකරුට කිසියම් රජයේ සහනාධාර, සමෘද්ධි ගෙවීම් හෝ වෙනත් "
                "සුබසාධන හුවමාරු ලැබේදැයි අසන්න."
            ),
        })

    return prompts


# ── Recommendation ───────────────────────────────────────────────────────────


def derive_recommendation(metrics: dict) -> str:
    """Return an APPROVE / REVIEW / DECLINE recommendation.

    Args:
        metrics: Output of :func:`compute_financial_metrics`.

    Returns:
        One of ``"APPROVE"``, ``"REVIEW"``, or ``"DECLINE"``.
    """
    dscr = metrics["dscr"]
    risk = metrics["risk_score"]

    if dscr >= 1.5 and risk >= 60:
        return "APPROVE"
    if dscr >= 1.0 and risk >= 40:
        return "REVIEW"
    return "DECLINE"
