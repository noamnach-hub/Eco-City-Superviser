
export interface AirtableThumbnail {
  url: string;
  width: number;
  height: number;
}

export interface AirtableAttachment {
  id: string;
  url: string;
  filename: string;
  size: number;
  type: string;
  thumbnails?: {
    small: AirtableThumbnail;
    large: AirtableThumbnail;
    full: AirtableThumbnail;
  };
}

export interface Fields {
  [key: string]: any;
}

export interface AirtableRecord {
  id: string;
  createdTime: string;
  fields: Fields;
}

export interface AppConfig {
  apiKey: string;
  baseId: string;
  
  // Table IDs
  paymentTableId: string;    
  approvalsTableId: string;  
  employeesTableId: string;  
  contractsTableId: string;  
  
  geminiApiKey: string;
  
  // Field Mappings
  fieldEmployeeEmail: string; 
  fieldEmployeeName: string;  
  fieldEmployeePassword: string; 
  fieldDepartment: string; 
  
  fieldApprovalStatus: string; 
  fieldApprovalEmployee: string;
  fieldApprovalEmployeeNameLookup?: string; 
  fieldApprovalContractLink?: string; // New: Link to Contract RecID
  fieldPaymentLink: string; 
  fieldSignature: string; 
  fieldApprovalSerial: string;
  fieldApprovalOrder: string; 
  fieldApprovalDescription: string; 
  fieldApprovalProject: string; 
  fieldApprovalSupplier: string; 
  fieldApprovalPaymentAmount: string; 
  
  // Reason Fields
  fieldRejectionReason: string;
  fieldDelayReason: string;
  
  fieldPaymentAttachments: string; 
  fieldPaymentAmount: string; 
  fieldPaymentProject: string; 
  fieldPaymentSupplier: string;
  fieldPaymentDescription: string; 
  fieldPaymentOrderNum: string; 
  
  // Contract Table Fields
  fieldContractRecId?: string; // New: RecID in Contracts table
  fieldContractPaymentLink: string; 
  fieldContractAttachments: string; 
  fieldMilestoneSection: string; 
  fieldMilestoneNumber: string; // New: Milestone Number
  fieldMilestoneLink: string; // New: Link to Milestone Record

  // --- Budget Control Fields ---
  fieldBudgetPaymentSource: string;
  fieldBudgetTotalToPay: string;
  fieldBudgetRefundNonVat: string;
  fieldBudgetRefundVat: string;
  fieldBudgetLinkage: string;
  fieldBudgetSumBeforeVat: string;
  fieldBudgetPaymentDesc: string;
  fieldBudgetPaymentOrder: string;
  
  // Table 2: Agreements/Contracts
  fieldContractDate: string;
  fieldContractDesc: string;
  fieldContractLinkage: string;
  fieldContractSum: string;
  fieldContractPaid: string;
  fieldContractInProcess: string;
  fieldContractBalance: string;

  // Summary Budget
  fieldBudgetUtilLine: string;
  fieldBudgetUpdatedLine: string;
  fieldBudgetUtilToday: string;
  fieldBudgetThisAccount: string;
  fieldBudgetBalanceUtil: string;
  fieldBudgetPercentUtil: string;

  statusWaitingValue: string;
  statusSignedValue: string;
  statusRejectedValue: string;
  statusDelayedValue: string;
}

export interface User {
  id: string; 
  name: string;
  email: string;
  password?: string;
}

export enum AppView {
  LOGIN = 'LOGIN',
  LIST = 'LIST',
  DETAIL = 'DETAIL'
}
