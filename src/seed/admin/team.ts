import { sampleId } from "../shared";
import { ROLE_IDS } from "./roles";

/**
 * Three people, one per role, because the Team screen is about what each may do rather than about
 * names. The owner administers, the supervisor gives the final approval, the assistant neither.
 */
export const team = [
  {
    id: sampleId(140, 1),
    email: "owner@example.com",
    name: "Alex Owner",
    role: "admin",
    role_id: ROLE_IDS.admin,
    picture_url: null,
    is_active: true,
    must_change_password: false,
    created_at: "2026-01-05T09:00:00Z",
    deputy_user_id: null,
    escalation_days: null,
    area: null,
    covers_all_areas: true,
    roles: { name: "admin" },
    user_company_access: [],
    user_permissions: [],
  },
  {
    id: sampleId(140, 2),
    email: "supervisor@example.com",
    name: "Sam Supervisor",
    role: "supervisor",
    role_id: ROLE_IDS.supervisor,
    picture_url: null,
    is_active: true,
    must_change_password: false,
    created_at: "2026-01-05T09:00:00Z",
    deputy_user_id: sampleId(140, 3),
    escalation_days: 3,
    area: null,
    covers_all_areas: true,
    roles: { name: "supervisor" },
    user_company_access: [],
    user_permissions: [],
  },
  {
    id: sampleId(140, 3),
    email: "clerk@example.com",
    name: "Kim Clerk",
    role: "assistant",
    role_id: ROLE_IDS.assistant,
    picture_url: null,
    is_active: true,
    must_change_password: false,
    created_at: "2026-02-02T09:00:00Z",
    deputy_user_id: null,
    escalation_days: null,
    area: null,
    // Sees one company only, which is what proves the scoping works rather than asserting it.
    covers_all_areas: false,
    roles: { name: "assistant" },
    user_company_access: [],
    user_permissions: [],
  },
];
