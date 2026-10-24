import { RoiCalculator } from "./roi-calculator";

type RoiLocale = "zh" | "en";
type RoiSearchParams = Promise<Record<string, string | string[] | undefined>>;

function parseLocale(searchParams: Record<string, string | string[] | undefined> | undefined): RoiLocale {
  const lang = Array.isArray(searchParams?.lang) ? searchParams?.lang[0] : searchParams?.lang;
  return lang === "en" ? "en" : "zh";
}

export default async function RoiPage({ searchParams }: { searchParams?: RoiSearchParams }) {
  const locale = parseLocale(searchParams ? await searchParams : undefined);
  return <RoiCalculator locale={locale} />;
}

export async function generateMetadata({ searchParams }: { searchParams?: RoiSearchParams }) {
  const locale = parseLocale(searchParams ? await searchParams : undefined);

  if (locale === "en") {
    return {
      title: "Closr ROI Model — Financial Case for Enterprise Sales Judgment",
      description: "Build a CFO-ready business case for Closr across sales management time, presales response cost, and enterprise-deal risk protection.",
    };
  }

  return {
    title: "Closr ROI 模型 — 给客户高层看的财务论证",
    description: "用客户财务能复核的口径，估算 Closr 在销售管理、售前响应和大单风险纠偏上的年度价值。",
  };
}
