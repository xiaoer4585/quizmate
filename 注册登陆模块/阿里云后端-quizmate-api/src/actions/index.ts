import type { ActionDependencies, ActionRegistry } from "../types.js";
import { createAccountActions } from "./accounts.js";
import { createAnalysisActions } from "./analysis.js";
import { createPaymentActions } from "./payments.js";
import { createConfigurationActions } from "./configuration.js";
import { createLicenseActions } from "./licenses.js";
import { createKnowledgeActions } from "./knowledge.js";
import { createAdminActions } from "./admin.js";
import { createWebsiteActions } from "./website.js";
import { createReferralActions } from "./referrals.js";
import { createSpeechActions } from "./speech.js";
import { createDomainInquiryActions } from "./domain-inquiries.js";
import { createCuotiActions } from "./cuoti.js";
import { createRedemptionCodeActions } from "./redemption-codes.js";
import { createResumeActions } from "./resume.js";
import { createActivityActions } from "./activities.js";

export function createActionRegistry(deps: ActionDependencies): ActionRegistry {
  return new Map([
    ...createAccountActions(deps),
    ...createAnalysisActions(deps),
    ...createPaymentActions(deps),
    ...createConfigurationActions(deps),
    ...createLicenseActions(deps),
    ...createKnowledgeActions(deps),
    ...createAdminActions(deps),
    ...createWebsiteActions(deps),
    ...createReferralActions(deps),
    ...createSpeechActions(deps),
    ...createDomainInquiryActions(deps),
    ...createCuotiActions(deps),
    ...createRedemptionCodeActions(deps),
    ...createResumeActions(deps),
    ...createActivityActions(deps)
  ]);
}
