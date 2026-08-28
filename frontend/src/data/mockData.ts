export const merchantData = {
  name: "Somchai's Noodle Shop",
  businessType: "Food & Beverage - Street Vendor",
  assessmentDate: new Date().toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  }),
  status: "Assessment Complete",
  score: 72,
  dscrValues: [
    { month: "Apr", value: 1.2 },
    { month: "May", value: 1.4 },
    { month: "Jun", value: 1.1 },
    { month: "Jul", value: 1.5 },
    { month: "Aug", value: 1.3 },
    { month: "Sep", value: 1.6 },
  ],
  avgDscr: 1.35,
  interpretation:
    "Moderate cash flow with seasonal variations. Stable core revenue stream detected.",
  prompts: [
    {
      id: 1,
      text: "Ask about the seasonal dip in March - what caused the 15% revenue drop?",
      category: "Revenue",
      priority: "high" as const,
    },
    {
      id: 2,
      text: "Verify the daily customer count claim of 80-120 customers",
      category: "Verification",
      priority: "high" as const,
    },
    {
      id: 3,
      text: "Inquire about supplier payment terms and any outstanding payables",
      category: "Risk",
      priority: "medium" as const,
    },
    {
      id: 4,
      text: "Confirm whether the business has other income sources not captured in QR transactions",
      category: "Verification",
      priority: "medium" as const,
    },
    {
      id: 5,
      text: "Discuss plans for the upcoming low season and cash reserve strategy",
      category: "Risk",
      priority: "low" as const,
    },
  ],
};

export const recentAssessments = [
  {
    id: "PHA-2026-0451",
    merchant: "Somchai's Noodle Shop",
    date: "Aug 27, 2026",
    score: 72,
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
