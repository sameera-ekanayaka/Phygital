export const merchantData = {
  name: "Binithi's Harvest Traders",
  businessType: "Agricultural Trading — Women-Owned Micro-Enterprise",
  assessmentDate: new Date().toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  }),
  status: "Assessment Complete",
  score: 78,
  monthlyRevenue: 450000,
  currency: "LKR",
  dscrValues: [
    { month: "Apr", value: 1.3 },
    { month: "May", value: 1.5 },
    { month: "Jun", value: 1.2 },
    { month: "Jul", value: 1.6 },
    { month: "Aug", value: 1.4 },
    { month: "Sep", value: 1.7 },
  ],
  avgDscr: 1.45,
  interpretation:
    "Consistent agricultural supply cycles detected with stable seasonal revenue patterns. Women-owned enterprise qualifies for NCGI Liya Shakthi guarantee.",
  ncgiEligible: true,
  ncgiCoveragePercent: 80,
  ncgiProgram: "Liya Shakthi",
  borrowerName: "Binithi Perera",
  maskedNic: "89****3456V",
  netCashFlow: 127500,
  monthlyOperatingMargin: 28.3,
  aiReasoning: [
    "Consistent agricultural supply cycles detected across 6-month period",
    "Revenue correlates with known paddy harvest seasons in Southern Province",
    "Transport costs stable at 13% of revenue — within agricultural norms",
    "No anomalous spikes or gaps — low fraud risk indicator",
    "Women-owned enterprise eligible for NCGI Liya Shakthi 80% guarantee",
  ],
  interviewPrompts: [
    {
      id: 1,
      text: "Verify seasonal harvest volumes — does the 50kg/delivery claim align with local market rates?",
      category: "Revenue Verification",
      priority: "high" as const,
    },
    {
      id: 2,
      text: "Confirm transport cost structure — Rs 2,000 per trip for what distance and frequency?",
      category: "Expense Validation",
      priority: "high" as const,
    },
    {
      id: 3,
      text: "Assess business continuity plan during off-season months (Oct-Dec)",
      category: "Risk Assessment",
      priority: "medium" as const,
    },
  ],
  mockTrilingualInput:
    "Ada harvest eken 50 kilos dunna Rs 15000. Lorry transport ekata Rs 2000 giya.",
  prompts: [
    {
      id: 1,
      text: "Verify seasonal harvest volumes — does the 50kg/delivery claim align with local market rates?",
      category: "Revenue Verification",
      priority: "high" as const,
    },
    {
      id: 2,
      text: "Confirm transport cost structure — Rs 2,000 per trip for what distance and frequency?",
      category: "Expense Validation",
      priority: "high" as const,
    },
    {
      id: 3,
      text: "Assess business continuity plan during off-season months (Oct-Dec)",
      category: "Risk Assessment",
      priority: "medium" as const,
    },
  ],
};

export const recentAssessments = [
  {
    id: "PHA-2026-0451",
    merchant: "Binithi's Harvest Traders",
    date: "Aug 27, 2026",
    score: 78,
    status: "Complete" as const,
  },
  {
    id: "PHA-2026-0448",
    merchant: "Priya Textiles",
    date: "Aug 25, 2026",
    score: 85,
    status: "Complete" as const,
  },
  {
    id: "PHA-2026-0443",
    merchant: "Kumara Fresh Mart",
    date: "Aug 22, 2026",
    score: 58,
    status: "Under Review" as const,
  },
];
