export type Subjects =
  | "all"

  // Core
  | "User"
  | "UserProfile"
  | "ResearcherProfile"

  // Organizations
  | "Organization"
  | "OrganizationUserAssociation"

  // Projects
  | "Project"
  | "ProjectRequest"
  | "ProjectAssignment"

  // VAPT
  | "Scope"
  | "Issue"
  | "IssueLabel"
  | "VaptReport"

  // Researcher
  | "ResearcherCertification"

  // Security / Audit
  | "AuditLog"
  | "RequestLog"
  | "Token"
  | "LoginHistory"

  // Activity
  | "Activity";
