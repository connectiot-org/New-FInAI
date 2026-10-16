export type Role = "Admin" | "Accountant" | "Reviewer";
export type AccountType =
  "Asset" | "Liability" | "Equity" | "Revenue" | "Expense";
export interface Account {
  id: string;
  name: string;
  type: AccountType;
  active: boolean;
}
export interface Entity {
  id: string;
  name: string;
  currency: "USD";
  country: string;
}
export interface Party {
  id: string;
  name: string;
  email: string;
  contact: string;
  entity: string;
}
export interface Line {
  account: string;
  debit: number;
  credit: number;
}
export interface Journal {
  id: string;
  entity: string;
  date: string;
  memo: string;
  status: "Draft" | "In review" | "Approved" | "Posted";
  lines: Line[];
  source?: string;
  reversalOf?: string;
  attachment?: string;
}
export interface Invoice {
  id: string;
  entity: string;
  customer: string;
  date: string;
  due: string;
  description: string;
  amount: number;
  paid: number;
  status: "Draft" | "Issued" | "Partial" | "Paid";
  department: string;
  lineItems?: { description: string; quantity: number; rate: number }[];
}
export interface Bill {
  id: string;
  entity: string;
  vendor: string;
  date: string;
  due: string;
  amount: number;
  account: string;
  status: "Inbox" | "In review" | "Approved" | "Paid";
  department: string;
}
export interface Contract {
  id: string;
  entity: string;
  customer: string;
  name: string;
  start: string;
  end: string;
  monthly: number;
  months: number;
}
export interface BankItem {
  id: string;
  entity: string;
  date: string;
  description: string;
  amount: number;
  candidate: string;
  matched: boolean;
}
export interface CloseTask {
  id: string;
  entity: string;
  title: string;
  owner: string;
  due: string;
  status: "To do" | "Complete" | "In review" | "Approved";
  evidence: string;
}
export interface Automation {
  id: string;
  name: string;
  trigger: string;
  threshold: number;
  action: string;
  enabled: boolean;
  runs: { date: string; count: number; action?: string }[];
}
export interface AuditEvent {
  id: string;
  date: string;
  actor: string;
  action: string;
  object: string;
  before: string;
  after: string;
}
export interface DemoState {
  version: 1;
  entered: boolean;
  profile: string;
  entity: string;
  period: string;
  role: Role;
  accounts: Account[];
  entities: Entity[];
  customers: Party[];
  vendors: Party[];
  journals: Journal[];
  invoices: Invoice[];
  bills: Bill[];
  contracts: Contract[];
  bank: BankItem[];
  tasks: CloseTask[];
  automations: Automation[];
  integrations: string[];
  syncLog: string[];
  audit: AuditEvent[];
  locked: string[];
  notifications: boolean;
  compact: boolean;
  workspace: string;
  approvalThreshold: number;
  dimensions: string[];
}
export interface DemoService {
  load(): Promise<DemoState>;
  save(state: DemoState): Promise<void>;
  reset(): Promise<DemoState>;
}
