import { createRoot } from "react-dom/client";
import { ContributionForm } from "./ContributionForm.js";

const memberId = new URLSearchParams(location.search).get("member") ?? "M0001";
createRoot(document.getElementById("root")!).render(<ContributionForm memberId={memberId} />);
