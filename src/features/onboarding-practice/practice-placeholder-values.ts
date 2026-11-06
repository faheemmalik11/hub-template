export function demoCompanyAndPropertyCodes(appUserId: string | null): {
  demoCompanyCode: string;
  demoPropertyCode: string;
} {
  const tag = (appUserId ?? "").replace(/-/g, "").slice(0, 8);
  return { demoCompanyCode: `DEMO-${tag}`, demoPropertyCode: `DEMO-${tag}-P1` };
}
