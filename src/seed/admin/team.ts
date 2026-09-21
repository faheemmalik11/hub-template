import { sampleId } from "../shared";

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
    is_active: true,
    covers_all_areas: true,
  },
  {
    id: sampleId(140, 2),
    email: "supervisor@example.com",
    name: "Sam Supervisor",
    role: "supervisor",
    is_active: true,
    covers_all_areas: true,
  },
  {
    id: sampleId(140, 3),
    email: "clerk@example.com",
    name: "Kim Clerk",
    role: "assistant",
    is_active: true,
    // Sees one company only, which is what proves the scoping works rather than asserting it.
    covers_all_areas: false,
  },
];
