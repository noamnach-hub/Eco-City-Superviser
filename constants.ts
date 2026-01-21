
import { AppConfig } from './types';

export const DEFAULT_CONFIG: AppConfig = {
  apiKey: '', // Set via environment variable or user configuration 
  baseId: 'appokOVm7SaDNfAjB', 
  
  // Table IDs
  paymentTableId: 'tblbAO3qF8bBFw0yE',     // הוראות תשלום
  approvalsTableId: 'tblFjsHltQjxK23RX',   // אישורי הוראת תשלום
  employeesTableId: 'tblrfUgtTi7kmtd64',   // עובדים
  contractsTableId: 'tbllMNrB0iIATxGNt',   // חוזים
  
  geminiApiKey: '', 
  
  // --- Employees Table ---
  fieldEmployeeEmail: 'אימייל',
  fieldEmployeeName: 'שם העובד',
  fieldEmployeePassword: 'סיסמא',
  fieldDepartment: 'שם מחלקה',
  
  // --- Approval Table ---
  fieldApprovalStatus: 'סטטוס אישור',
  fieldApprovalEmployee: 'מאשר נדרש', 
  fieldApprovalEmployeeNameLookup: 'שם מאשר נדרש',
  fieldApprovalContractLink: 'RecID Contract', // Field Name in Approval Table
  fieldPaymentLink: 'Payment_Rec_ID',
  fieldSignature: 'חתימה',
  fieldApprovalSerial: 'מספר רץ',
  fieldApprovalOrder: 'סדר אישור',
  fieldApprovalDescription: 'תיאור הוראת תשלום', 
  fieldApprovalProject: 'שם פרויקט', 
  fieldApprovalSupplier: 'שם ספק', 
  fieldApprovalPaymentAmount: 'סכום לתשלום', 
  
  // Reason Fields
  fieldRejectionReason: 'סיבת דחיה',
  fieldDelayReason: 'סיבת עיכוב',
  
  // --- Payment Table ---
  fieldPaymentAttachments: 'חשבון עסקה', 
  fieldPaymentAmount: 'קרן - סכום לתשלום (לא כולל מעמ)',
  fieldPaymentProject: 'שם פרויקט', 
  fieldPaymentSupplier: 'שם ספק',
  fieldPaymentDescription: 'תיאור השירות / המוצר', 
  fieldPaymentOrderNum: "מס' הוראת תשלום",
  
  // --- Contract Table Fields (Using Names) ---
  fieldContractRecId: 'RecID', 
  fieldContractPaymentLink: 'Payment_Rec_ID', 
  fieldContractAttachments: 'קובץ חוזה', 
  fieldMilestoneSection: 'מספר סעיף בחוזה לאבן הדרך',
  fieldMilestoneNumber: 'אבן דרך מספר', 
  fieldMilestoneLink: 'קישור לאבן דרך מהחוזה',

  // --- Budget Control Fields ---
  fieldBudgetPaymentSource: 'מקור תשלום',
  fieldBudgetTotalToPay: 'סה"כ לתשלום',
  fieldBudgetRefundNonVat: 'החזר הוצאות פטורות ממעמ',
  fieldBudgetRefundVat: 'החזר הוצאות חייבות במעמ',
  fieldBudgetLinkage: 'הצמדה לתשלום',
  fieldBudgetSumBeforeVat: 'קרן - סכום לתשלום (לא כולל מעמ)',
  fieldBudgetPaymentDesc: 'תיאור השירות / המוצר',
  fieldBudgetPaymentOrder: "מס' הוראת תשלום",
  
  // --- Budget Control Fields (Contracts Table) ---
  fieldContractDate: 'תאריך חתימה',
  fieldContractDesc: 'נושא החוזה',
  fieldContractLinkage: 'הצמדה', 
  fieldContractSum: 'סכום החוזה',
  fieldContractPaid: 'סך כל הוראות התשלום בחוזה לפני מעמ',
  fieldContractInProcess: 'בתהליך', 
  fieldContractBalance: 'יתרה לתשלום', 

  // --- Summary Budget ---
  fieldBudgetUtilLine: 'תקציב חברה מקור לסעיף', 
  fieldBudgetUpdatedLine: 'תקציב חברה מעודכן לסעיף',
  fieldBudgetUtilToday: 'נוצל עד היום',
  fieldBudgetThisAccount: 'חשבון זה',
  fieldBudgetBalanceUtil: 'יתרה לניצול',
  fieldBudgetPercentUtil: 'אחוז ניצול (כולל תשלום זה)',

  statusWaitingValue: 'ממתין לאישור', 
  statusSignedValue: 'אושר',
  statusRejectedValue: 'נדחה', 
  statusDelayedValue: 'עיכוב'   
};

export const AIRTABLE_API_BASE = 'https://api.airtable.com/v0';
