
import { AIRTABLE_API_BASE } from '../constants';
import { AppConfig, AirtableRecord, User } from '../types';

// Helper for API calls
const fetchAirtable = async (url: string, apiKey: string, options: RequestInit = {}) => {
  const headers = {
    Authorization: `Bearer ${apiKey}`,
    'Content-Type': 'application/json',
    ...options.headers,
  };
  
  const response = await fetch(url, { ...options, headers });
  if (!response.ok) {
    const errorBody = await response.json().catch(() => ({}));
    throw new Error(errorBody.error?.message || `Airtable Error: ${response.statusText}`);
  }
  return response.json();
};

/**
 * Fetches the Base Schema (Tables and Fields) using the Metadata API.
 * Requires a token with `schema.bases.read` scope.
 */
export const fetchBaseSchema = async (config: AppConfig) => {
  const url = `${AIRTABLE_API_BASE}/meta/bases/${config.baseId}/tables`;
  try {
    const data = await fetchAirtable(url, config.apiKey);
    return data.tables || [];
  } catch (e) {
    console.warn("Failed to fetch base schema (Metadata API). Ensure your token has 'schema.bases.read' scope.", e);
    return [];
  }
};

/**
 * Authenticates user by Email against the Employees table.
 */
export const loginUser = async (config: AppConfig, email: string): Promise<User | null> => {
  if (!email) return null;
  
  const filterFormula = `LOWER({${config.fieldEmployeeEmail}}) = '${email.toLowerCase()}'`;
  const url = `${AIRTABLE_API_BASE}/${config.baseId}/${config.employeesTableId}?filterByFormula=${encodeURIComponent(filterFormula)}`;
  
  try {
    const data = await fetchAirtable(url, config.apiKey);
    if (data.records && data.records.length > 0) {
      const record = data.records[0];
      return {
        id: record.id,
        name: record.fields['שם העובד'] || record.fields['Name'] || record.fields['Full Name'] || email.split('@')[0],
        email: email,
        password: record.fields[config.fieldEmployeePassword]
      };
    }
    return null;
  } catch (e) {
    console.error("Login failed", e);
    throw e;
  }
};

/**
 * Fetches employees.
 */
export const fetchEmployeesByDepartment = async (config: AppConfig, department: string): Promise<User[]> => {
  if (!department) return [];

  const filterFormula = `{${config.fieldDepartment}} = '${department}'`;
  const url = `${AIRTABLE_API_BASE}/${config.baseId}/${config.employeesTableId}?filterByFormula=${encodeURIComponent(filterFormula)}`;

  try {
    const data = await fetchAirtable(url, config.apiKey);
    return (data.records || []).map((record: AirtableRecord) => ({
      id: record.id,
      name: record.fields[config.fieldEmployeeName] || 'Unknown',
      email: record.fields[config.fieldEmployeeEmail] || ''
    }));
  } catch (e) {
    console.error("Failed to fetch employees by department", e);
    return [];
  }
};

/**
 * Fetches ALL approvals.
 */
export const fetchUserApprovals = async (config: AppConfig, user: User): Promise<AirtableRecord[]> => {
  const filterFormula = `OR(
      SEARCH('${user.id}', {${config.fieldApprovalEmployee}}) > 0,
      SEARCH('${user.name}', {${config.fieldApprovalEmployee}}) > 0
    )`;
  
  const cleanFormula = filterFormula.replace(/\s+/g, ' ');
  // Using Field Names now
  const url = `${AIRTABLE_API_BASE}/${config.baseId}/${config.approvalsTableId}?filterByFormula=${encodeURIComponent(cleanFormula)}`;
  
  const data = await fetchAirtable(url, config.apiKey);
  const records: AirtableRecord[] = data.records || [];
  
  return records.sort((a, b) => new Date(b.createdTime).getTime() - new Date(a.createdTime).getTime());
};

const extractOrderNumber = (val: any): number => {
  if (typeof val === 'number') return val;
  const sVal = Array.isArray(val) ? String(val[0]) : String(val || '');
  const match = sVal.match(/\d+/);
  return match ? parseInt(match[0], 10) : 9999;
};

/**
 * Fetches approvals by Payment ID.
 */
export const fetchApprovalsByPaymentID = async (config: AppConfig, paymentId: string): Promise<AirtableRecord[]> => {
  const filterFormula = `{${config.fieldPaymentLink}} = '${paymentId}'`;
  const url = `${AIRTABLE_API_BASE}/${config.baseId}/${config.approvalsTableId}?filterByFormula=${encodeURIComponent(filterFormula)}`;

  try {
    const data = await fetchAirtable(url, config.apiKey);
    const records: AirtableRecord[] = data.records || [];
    
    // Sort by Order
    return records.sort((a, b) => {
       const valA = a.fields[config.fieldApprovalOrder];
       const valB = b.fields[config.fieldApprovalOrder];
       const numA = extractOrderNumber(valA);
       const numB = extractOrderNumber(valB);
       return numA - numB;
    });
  } catch (e) {
    console.error("Failed to fetch payment approvals", e);
    return [];
  }
};

/**
 * Fetches approvals for MULTIPLE Payment IDs.
 */
export const fetchApprovalsByPaymentIDs = async (config: AppConfig, paymentIds: string[]): Promise<AirtableRecord[]> => {
  if (paymentIds.length === 0) return [];
  
  const chunks = [];
  const chunkSize = 20;
  for (let i = 0; i < paymentIds.length; i += chunkSize) {
      chunks.push(paymentIds.slice(i, i + chunkSize));
  }
  
  let allRecords: AirtableRecord[] = [];
  
  try {
    for (const chunk of chunks) {
        const formula = `OR(${chunk.map(id => `{${config.fieldPaymentLink}}='${id}'`).join(',')})`;
        const url = `${AIRTABLE_API_BASE}/${config.baseId}/${config.approvalsTableId}?filterByFormula=${encodeURIComponent(formula)}`;
        const data = await fetchAirtable(url, config.apiKey);
        if (data.records) allRecords = [...allRecords, ...data.records];
    }
  } catch (e) {
    console.error("Failed to fetch approvals by payment IDs", e);
  }
  return allRecords;
};

/**
 * Fetches Payment details.
 */
export const fetchPaymentDetails = async (config: AppConfig, paymentRecordId: string): Promise<AirtableRecord | null> => {
  if (!paymentRecordId) return null;
  
  const url = `${AIRTABLE_API_BASE}/${config.baseId}/${config.paymentTableId}/${paymentRecordId}`;
  
  try {
    return await fetchAirtable(url, config.apiKey);
  } catch (e) {
    console.error("Failed to fetch payment details", e);
    return null;
  }
};

/**
 * Fetches multiple payments by IDs (for list view context).
 */
export const fetchPaymentsByIds = async (config: AppConfig, ids: string[]): Promise<AirtableRecord[]> => {
  if (ids.length === 0) return [];
  
  // Chunking to avoid URL too long (approx 20 IDs per request is safe)
  const chunks = [];
  const chunkSize = 20;
  for (let i = 0; i < ids.length; i += chunkSize) {
      chunks.push(ids.slice(i, i + chunkSize));
  }
  
  let allRecords: AirtableRecord[] = [];
  
  try {
    for (const chunk of chunks) {
        const formula = `OR(${chunk.map(id => `RECORD_ID()='${id}'`).join(',')})`;
        const url = `${AIRTABLE_API_BASE}/${config.baseId}/${config.paymentTableId}?filterByFormula=${encodeURIComponent(formula)}`;
        const data = await fetchAirtable(url, config.apiKey);
        if (data.records) allRecords = [...allRecords, ...data.records];
    }
  } catch (e) {
    console.error("Failed to fetch payments by IDs", e);
  }
  return allRecords;
};

/**
 * Fetches multiple contracts by IDs or RecIDs (for list view context).
 */
export const fetchContractsByIds = async (config: AppConfig, ids: string[]): Promise<AirtableRecord[]> => {
  if (ids.length === 0) return [];
  
  // Chunking
  const chunks = [];
  const chunkSize = 15;
  for (let i = 0; i < ids.length; i += chunkSize) {
      chunks.push(ids.slice(i, i + chunkSize));
  }
  
  let allRecords: AirtableRecord[] = [];
  const fieldId = config.fieldContractRecId || 'RecID';

  try {
    for (const chunk of chunks) {
        // Try to match by Record ID OR by the Custom RecID field
        const formula = `OR(${chunk.map(id => `RECORD_ID()='${id}'`).join(',')}, ${chunk.map(id => `{${fieldId}}='${id}'`).join(',')})`;
        const url = `${AIRTABLE_API_BASE}/${config.baseId}/${config.contractsTableId}?filterByFormula=${encodeURIComponent(formula)}`;
        const data = await fetchAirtable(url, config.apiKey);
        if (data.records) allRecords = [...allRecords, ...data.records];
    }
  } catch (e) {
    console.error("Failed to fetch contracts by IDs", e);
  }
  return allRecords;
};


/**
 * Fetches Contract by RecID.
 */
export const fetchContract = async (config: AppConfig, contractRecIdValue: string): Promise<AirtableRecord | null> => {
  if (!contractRecIdValue) return null;

  // Use the fieldContractRecId (RecID in Contracts table) to filter
  const fieldId = config.fieldContractRecId || 'RecID';
  const filterFormula = `{${fieldId}} = '${contractRecIdValue}'`;
  const url = `${AIRTABLE_API_BASE}/${config.baseId}/${config.contractsTableId}?filterByFormula=${encodeURIComponent(filterFormula)}&maxRecords=1`;

  try {
    const data = await fetchAirtable(url, config.apiKey);
    if (data.records && data.records.length > 0) {
      return data.records[0];
    }
    return null;
  } catch (e) {
    console.error("Failed to fetch contract", e);
    return null;
  }
};

/**
 * Fetch related payments.
 */
export const fetchRelatedPayments = async (config: AppConfig, project: string, supplier: string): Promise<AirtableRecord[]> => {
  if (!project) return [];

  const filterFormula = `AND(
    {${config.fieldPaymentProject}} = '${project}',
    {${config.fieldPaymentSupplier}} = '${supplier}'
  )`;
  
  const url = `${AIRTABLE_API_BASE}/${config.baseId}/${config.paymentTableId}?filterByFormula=${encodeURIComponent(filterFormula)}&maxRecords=50&sort%5B0%5D%5Bfield%5D=${encodeURIComponent(config.fieldBudgetPaymentOrder)}&sort%5B0%5D%5Bdirection%5D=asc`;

  try {
    const data = await fetchAirtable(url, config.apiKey);
    return data.records || [];
  } catch (e) {
    console.error("Failed to fetch related payments", e);
    return [];
  }
};

/**
 * Fetches records from a generic table with optional filter.
 * Used for fetching Milestones.
 * @param throwError If true, throws exception on failure instead of returning empty array.
 */
export const fetchTableRecords = async (config: AppConfig, tableIdOrName: string, filterFormula: string = '', throwError: boolean = false): Promise<AirtableRecord[]> => {
  // Properly encode the table name to handle Hebrew characters or spaces
  const encodedTableIdentifier = encodeURIComponent(tableIdOrName);
  let url = `${AIRTABLE_API_BASE}/${config.baseId}/${encodedTableIdentifier}`;
  
  if (filterFormula) {
      url += `?filterByFormula=${encodeURIComponent(filterFormula)}`;
  }

  try {
    const data = await fetchAirtable(url, config.apiKey);
    return data.records || [];
  } catch (e) {
    console.error(`Failed to fetch records from ${tableIdOrName}`, e);
    if (throwError) throw e;
    return [];
  }
};

export const updateApprovalStatus = async (
  config: AppConfig,
  approvalRecordId: string,
  status: string,
  extraFields: Record<string, any> = {}
): Promise<void> => {
  const url = `${AIRTABLE_API_BASE}/${config.baseId}/${config.approvalsTableId}/${approvalRecordId}`;

  const body = {
    fields: {
      [config.fieldApprovalStatus]: status,
      ...extraFields
    },
    typecast: true
  };

  await fetchAirtable(url, config.apiKey, {
    method: 'PATCH',
    body: JSON.stringify(body),
  });
};

export const updateApprovalAssignee = async (
  config: AppConfig,
  approvalRecordId: string,
  newEmployeeId: string
): Promise<void> => {
  const url = `${AIRTABLE_API_BASE}/${config.baseId}/${config.approvalsTableId}/${approvalRecordId}`;

  const body = {
    fields: {
      [config.fieldApprovalEmployee]: [newEmployeeId] 
    },
    typecast: true
  };

  await fetchAirtable(url, config.apiKey, {
    method: 'PATCH',
    body: JSON.stringify(body),
  });
};

export const updateRecordFields = async (
  config: AppConfig,
  tableId: string,
  recordId: string,
  fields: Record<string, any>
): Promise<void> => {
  const url = `${AIRTABLE_API_BASE}/${config.baseId}/${tableId}/${recordId}`;
  await fetchAirtable(url, config.apiKey, {
    method: 'PATCH',
    body: JSON.stringify({ fields, typecast: true }),
  });
};

export const fetchTableFields = async (config: AppConfig): Promise<string[]> => {
  if (!config.approvalsTableId) return [];
  const url = `${AIRTABLE_API_BASE}/${config.baseId}/${config.approvalsTableId}?maxRecords=1`;
  try {
    const data = await fetchAirtable(url, config.apiKey);
    if (data.records && data.records.length > 0) {
      return Object.keys(data.records[0].fields);
    }
    return [];
  } catch (e) {
    console.error("Failed to fetch table fields", e);
    throw e;
  }
};
