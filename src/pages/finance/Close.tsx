import { useSearchParams } from "react-router-dom";
import MonthClose from "./MonthClose";
import FinanceDashboard from "./Dashboard";

/** Finance › Close: Checklist (month close) and Approvals (entries, exceptions and feeds waiting). */
export default function Close() {
  const [params] = useSearchParams();
  return params.get("view") === "approvals" ? <FinanceDashboard approvals /> : <MonthClose />;
}
