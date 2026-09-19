export interface AiSearchVocabulary {
  companies: { code: string; name: string | null; aliases?: string[] }[];
  properties: { code: string; name: string | null; aliases?: string[] }[];
  categories: string[];
  categoryAliases?: Record<string, string[]>;
  suppliers: string[];
}

export type SumField = "gross" | "net" | "vat";
export type GroupByDimension = "company" | "issuer" | "property" | "category";
export type AnswerLanguage = "de" | "en";

export interface ModelJsonRequest {
  instructions: string;
  input: string;
  schemaName: string;
  schema: object;
  temperature?: number;
}

export interface ModelUsage {
  provider: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
}

export interface ModelJsonResult {
  data: unknown;
  usage: ModelUsage | null;
}

export interface ModelJsonClient {
  completeJson(request: ModelJsonRequest): Promise<ModelJsonResult>;
}

export interface ModelUsageContext {
  stage: "classify" | "sql_generate";
  attempt: number;
}

export interface EmbeddingClient {
  embed(text: string): Promise<number[]>;
}

export interface InvoiceMatch {
  id: string;
  invoiceNumber: string | null;
  issuer: string | null;
  documentDate: string | null;
  amountGross: number | null;
  companyCode: string | null;
  propertyCode: string | null;
  costCategory: string | null;
  serviceDescription: string | null;
  isPaid: boolean;
  similarity: number | null;
}

export interface InvoiceSearchRow {
  id: string;
  invoice_number: string | null;
  issuer: string | null;
  document_date: string | null;
  amount_gross: number | null;
  company_code: string | null;
  property_code: string | null;
  cost_category: string | null;
  service_description: string | null;
  paid_at: string | null;
  similarity: number | null;
}

export interface GroupedTotalRow {
  group_key: string;
  invoice_count: number;
  total_gross: number;
  total_net: number;
  total_vat: number;
  paid_gross: number;
  open_gross: number;
}

export interface AggregateTotalsRow {
  total_count: number;
  total_gross: number;
  total_net: number;
  total_vat: number;
  all_paid_count: number;
  all_paid_gross: number;
  all_paid_net: number;
  all_paid_vat: number;
  all_open_count: number;
  all_open_gross: number;
  all_open_net: number;
  all_open_vat: number;
}

export interface AggregateResult {
  totalCount: number;
  totalGross: number;
  totalNet: number;
  totalVat: number;
  allPaidCount: number;
  allPaidGross: number;
  allPaidNet: number;
  allPaidVat: number;
  allOpenCount: number;
  allOpenGross: number;
  allOpenNet: number;
  allOpenVat: number;
  sumField: SumField;
}

export type QueryColumnType = "text" | "number" | "date" | "boolean";

export interface QueryColumnSpec {
  name: string;
  type: QueryColumnType;
  description: string;
  label?: string;
  values?: string[];
  terms?: string[];
}

export interface IntentSpec {
  name: string;
  purpose: string;
  examples: string[];
}

export interface IntentEntities {
  companies: string[];
  suppliers: string[];
  property: string | null;
  category: string | null;
  dateFrom: string | null;
  dateTo: string | null;
  amountMin: number | null;
  amountMax: number | null;
  paymentState: "open" | "paid" | "overdue" | null;
  reviewState: "needed" | "clear" | null;
  bankMatch: "any" | "matched" | "suggested" | "unmatched" | null;
  unassignedCompany: boolean;
  documentType: "invoice" | "credit_note" | "other" | null;
  workflowStep: string | null;
  datevHandover: "done" | "pending" | null;
  trafficLight: "green" | "yellow" | "red" | "flagged" | null;
  archived: boolean;
  dueDateFrom: string | null;
  dueDateTo: string | null;
  dateMonth: number | null;
  dueDateMonth: number | null;
  directDebit: boolean | null;
  totalField: "gross" | "net" | "vat" | null;
  groupBy: GroupByDimension | null;
  topic: string | null;
}

export interface IntentExampleSpec {
  question: string;
  intent: string;
  entities: Partial<IntentEntities>;
}

export interface IntentClassification {
  intent: string;
  confidence: number;
  entities: IntentEntities;
  language: AnswerLanguage;
}

export interface SqlSearchIntent {
  whereClause: string | null;
  aggregate: "sum" | "count" | null;
  sumField: SumField;
  groupBy: GroupByDimension | null;
  unsupportedAspects: string[];
  needsSemanticRanking: boolean;
  semanticTopic: string | null;
  offTopic: boolean;
  language: AnswerLanguage;
  rejectedWhereClause: string | null;
}

export interface SqlSearchExecutor {
  searchWhere(
    whereClause: string | null,
    embedding: number[] | null,
    limit: number,
  ): Promise<InvoiceSearchRow[]>;
  aggregateWhere(whereClause: string | null): Promise<AggregateTotalsRow | null>;
  groupedTotalsWhere?(
    whereClause: string | null,
    groupBy: GroupByDimension,
    limit: number,
  ): Promise<GroupedTotalRow[]>;
}

export interface WorkflowStepSpec {
  value: string;
  meaning: string;
}

export interface IntentClassifierConfig {
  intentModel: ModelJsonClient;
  classifierModel?: ModelJsonClient;
  promptExamples: { companyCode: string; supplierName: string };
  intents?: IntentSpec[];
  entityExamples?: IntentExampleSpec[];
  workflowSteps?: WorkflowStepSpec[];
  unassignedCompanyCode?: string | null;
  now?: () => Date;
  onModelUsage?: (usage: ModelUsage, context: ModelUsageContext) => void;
}

export interface EntityMappingSpec {
  entity: string;
  rule: string;
}

export interface QueryScopeSpec {
  active: string[];
  archived: string[];
}

export interface DateColumnSpec {
  document: string;
  due: string;
}

export interface AiSqlSearchConfig extends IntentClassifierConfig {
  vocabulary(): Promise<AiSearchVocabulary>;
  columns: QueryColumnSpec[];
  executor: SqlSearchExecutor;
  synthesisModel: ModelJsonClient;
  embeddings?: EmbeddingClient;
  sqlPreviewTable?: string;
  searchLimit?: number;
  minSemanticSimilarity?: number;
  maxConditions?: number;
}

export interface SqlRetrievalResult {
  intent: string;
  confidence: number;
  entities: IntentEntities;
  matches: InvoiceMatch[];
  whereClause: string | null;
  rejectedWhereClause: string | null;
  sql: string;
  aggregate: AggregateResult | null;
  groupedTotals: { groupBy: GroupByDimension; rows: GroupedTotalRow[] } | null;
  unsupportedAspects: string[];
  filteredTotals: AggregateTotalsRow | null;
  totalMatches: number | null;
  semantic: boolean;
  offTopic: boolean;
  broad: boolean;
  language: AnswerLanguage;
}

export interface AiSqlSearchResult extends SqlRetrievalResult {
  answer: string;
}
