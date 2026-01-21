
import React, { useState, useEffect, useMemo, useRef, PropsWithChildren } from 'react';
import ReactDOM from 'react-dom';
import { DEFAULT_CONFIG } from './constants';
import { AppConfig, AirtableRecord, User, AppView } from './types';
import SignaturePad from './components/SignaturePad';
import { 
  loginUser, 
  fetchUserApprovals, 
  fetchPaymentDetails, 
  updateApprovalStatus, 
  fetchContract, 
  fetchApprovalsByPaymentID,
  fetchEmployeesByDepartment,
  updateApprovalAssignee,
  fetchRelatedPayments,
  fetchPaymentsByIds,
  fetchBaseSchema,
  fetchTableRecords,
  updateRecordFields,
  fetchContractsByIds,
  fetchApprovalsByPaymentIDs
} from './services/airtableService';

type FilterType = 'WAITING' | 'APPROVED' | 'REJECTED' | 'DELAYED' | 'ALL';
type ActionType = 'APPROVE' | 'REJECT' | 'DELAY' | 'TRANSFER' | null;
type ListMode = 'CARDS' | 'TABLE';

// --- Helpers ---

const formatDate = (dateStr: string | undefined): string => {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  return `${d.getDate().toString().padStart(2, '0')}/${(d.getMonth() + 1).toString().padStart(2, '0')}/${d.getFullYear()}`;
};

const formatCurrency = (amount: any): string => {
  if (amount === null || amount === undefined || amount === '') return '';
  
  let val = amount;
  // Handle nested arrays (Airtable lookups)
  while (Array.isArray(val)) {
    if (val.length === 0) return '';
    val = val[0];
  }

  if (typeof val === 'object' && val !== null) {
      try { val = JSON.stringify(val); } catch (e) { return ''; }
  }
  
  const strVal = String(val);
  const cleanStr = strVal.replace(/[^0-9.-]+/g, "");
  const num = parseFloat(cleanStr);
  if (isNaN(num)) return '';
  
  return num.toLocaleString('he-IL', {
    style: 'currency',
    currency: 'ILS',
    minimumFractionDigits: 0, 
    maximumFractionDigits: 0
  });
};

const getPdfUrl = (record: AirtableRecord | null, fieldKey: string): string | null => {
  if (!record) return null;
  // fieldKey should be the ID from config
  const attachments = record.fields[fieldKey];
  
  if (Array.isArray(attachments) && attachments.length > 0) {
     return attachments[0].url;
  }
  return null;
};

// Safe Field Accessor (By Config Key or Name)
const f = (record: AirtableRecord | null, config: AppConfig, key: keyof AppConfig): any => {
    if (!record) return null;
    const fieldIdOrName = config[key] as string;
    if (record.fields[fieldIdOrName] !== undefined) return record.fields[fieldIdOrName];
    return null;
};

// Safe string extraction - Enhanced for User Objects and Lookups
const s = (val: any): string => {
  if (val === undefined || val === null) return '';
  
  // Handle Airtable User Object (Single)
  if (typeof val === 'object' && !Array.isArray(val)) {
    if (val.name) return String(val.name);
    if (val.email) return String(val.email);
    return '';
  }

  if (Array.isArray(val)) {
     if (val.length === 0) return '';
     const first = val[0];
     // Handle Array of User Objects or Lookups
     if (typeof first === 'object' && first !== null) {
        if (first.name) return String(first.name);
     }
     return String(first);
  }
  return String(val);
};

const extractOrderNumber = (val: any): number => {
  if (typeof val === 'number') return val;
  const sVal = Array.isArray(val) ? String(val[0]) : String(val || '');
  const match = sVal.match(/\d+/);
  return match ? parseInt(match[0], 10) : 9999;
};

// Portal for Dropdown to avoid clipping
type PortalDropdownProps = PropsWithChildren<{
  triggerRect: DOMRect;
  onClose: () => void;
}>;

const PortalDropdown = ({ 
    children, 
    triggerRect, 
    onClose 
}: PortalDropdownProps) => {
    // In RTL, we want to align the RIGHT edge of the dropdown with the RIGHT edge of the trigger button
    // This prevents it from flowing off-screen to the right.
    const style: React.CSSProperties = {
        position: 'fixed',
        top: triggerRect.bottom + 4,
        right: window.innerWidth - triggerRect.right, // Align right edge
        width: Math.max(triggerRect.width, 240),
        zIndex: 9999,
        direction: 'rtl'
    };
    
    // Fallback for mobile or small screens if needed
    if (window.innerWidth < 768) {
        style.right = 16;
        style.left = 16;
        style.width = 'auto';
    }

    return ReactDOM.createPortal(
        <><div className="fixed inset-0 bg-transparent z-[9990]" onClick={onClose} /><div className="bg-white rounded-xl shadow-2xl border border-gray-100 overflow-hidden animate-in fade-in slide-in-from-top-2 flex flex-col max-h-80" style={style}>{children}</div></>,
        document.body
    );
};

interface SearchableSelectProps {
  options: string[];
  value: string;
  onChange: (val: string) => void;
  placeholder: string;
  icon?: React.ReactNode;
}

const SearchableSelect = ({ options, value, onChange, placeholder, icon }: SearchableSelectProps) => {
  const [isOpen, setIsOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const buttonRef = useRef<HTMLDivElement>(null);
  const [triggerRect, setTriggerRect] = useState<DOMRect | null>(null);

  const handleOpen = () => { 
    if (buttonRef.current) { 
      setTriggerRect(buttonRef.current.getBoundingClientRect()); 
    } 
    setIsOpen(true); 
    setSearchTerm(''); 
  };

  const filteredOptions = useMemo(() => { 
    if (!searchTerm) return options; 
    return options.filter(opt => opt.toLowerCase().includes(searchTerm.toLowerCase())); 
  }, [options, searchTerm]);

  const handleSelect = (opt: string) => { 
    onChange(opt); 
    setIsOpen(false); 
  };

  return (
    <>
      <div 
        ref={buttonRef} 
        className={`flex items-center justify-between bg-white border rounded-xl px-3 py-2.5 cursor-pointer transition-all shadow-sm min-w-[180px] ${isOpen ? 'ring-2 ring-ecogreen-500 border-ecogreen-500' : 'border-gray-200 hover:border-ecogreen-300'}`} 
        onClick={handleOpen}
      >
         <div className="flex items-center gap-2 overflow-hidden">
           {icon && <div className="text-gray-400 shrink-0">{icon}</div>}
           <div className={`text-sm font-medium truncate ${value ? 'text-gray-900' : 'text-gray-400'}`}>{value || placeholder}</div>
         </div>
         <div className="flex items-center">
           {value && (
             <div 
               onClick={(e) => { e.stopPropagation(); onChange(''); }} 
               className="ml-2 p-1 hover:bg-gray-100 rounded-full text-gray-400 hover:text-gray-600 transition-colors"
             >
               <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4"><path d="M6.28 5.22a.75.75 0 00-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 101.06 1.06L10 11.06l3.72 3.72a.75.75 0 101.06-1.06L11.06 10l3.72-3.72a.75.75 0 00-1.06-1.06L10 8.94 6.28 5.22z" /></svg>
             </div>
           )}
           <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className={`w-4 h-4 text-gray-400 transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`}><path fillRule="evenodd" d="M5.23 7.21a.75.75 0 011.06.02L10 11.168l3.71-3.938a.75.75 0 111.08 1.04l-4.25 4.5a.75.75 0 01-1.08 0l-4.25-4.5a.75.75 0 01.02-1.06z" clipRule="evenodd" /></svg>
         </div>
      </div>
      {isOpen && triggerRect && (
        <PortalDropdown triggerRect={triggerRect} onClose={() => setIsOpen(false)}>
          <div className="p-2 border-b border-gray-100 bg-gray-50 sticky top-0 z-10">
            <input autoFocus type="text" className="w-full pl-8 pr-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:border-ecogreen-500 focus:ring-1 focus:ring-ecogreen-200 bg-white" placeholder="חפש..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} dir="rtl" />
          </div>
          <div className="overflow-y-auto custom-scrollbar p-1 flex-1">
            <div className={`px-3 py-2 rounded-lg text-sm cursor-pointer mb-0.5 text-right ${value === '' ? 'bg-ecogreen-50 text-ecogreen-700 font-bold' : 'text-gray-700 hover:bg-gray-100'}`} onClick={() => handleSelect('')}>הכל</div>
            {filteredOptions.length === 0 && <div className="px-3 py-2 text-xs text-gray-400 text-center">אין תוצאות</div>}
            {filteredOptions.map(opt => (
              <div key={opt} className={`px-3 py-2 rounded-lg text-sm cursor-pointer mb-0.5 text-right flex items-center justify-between ${value === opt ? 'bg-ecogreen-50 text-ecogreen-700 font-bold' : 'text-gray-700 hover:bg-gray-100'}`} onClick={() => handleSelect(opt)}>
                <span className="truncate">{opt}</span>
              </div>
            ))}
          </div>
        </PortalDropdown>
      )}
    </>
  );
};

type BackgroundContainerProps = PropsWithChildren<{}>;

const BackgroundContainer = ({ children }: BackgroundContainerProps) => (
  <div className="min-h-screen flex flex-col font-sans relative bg-gray-100" dir="rtl">
    <div className="absolute inset-0 z-0 bg-cover bg-center fixed" style={{ backgroundImage: "url('https://images.unsplash.com/photo-1486406146926-c627a92ad1ab?ixlib=rb-4.0.3&auto=format&fit=crop&w=2070&q=80')", opacity: 0.2, mixBlendMode: 'multiply' }}></div>
    <div className="relative z-10 flex flex-col h-full flex-1">{children}</div>
  </div>
);

const DocumentModal = ({ url, title, onClose }: { url: string; title: string; onClose: () => void }) => {
  if (!url) return null;

  const isImage = (u: string) => {
      if (!u) return false;
      const clean = u.split('?')[0].toLowerCase();
      return ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.svg', '.bmp'].some(ext => clean.endsWith(ext));
  };

  const renderContent = () => {
      if (isImage(url)) {
          return (
             <div className="w-full h-full flex items-center justify-center p-2">
                <img src={url} alt={title} className="max-w-full max-h-full object-contain shadow-sm" />
             </div>
          );
      }
      // Use Google Docs Viewer for PDFs and other documents to ensure they render in iframe on mobile
      // instead of forcing a download or showing a 'click to view' link.
      const viewerUrl = `https://docs.google.com/gview?url=${encodeURIComponent(url)}&embedded=true`;
      return <iframe src={viewerUrl} className="w-full h-full border-none" title="Document Viewer" />;
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-90 p-2 md:p-8 backdrop-blur-sm animate-in fade-in" style={{zIndex: 9999}}>
      <div className="bg-white w-full h-full md:w-[90%] md:h-[90%] rounded-xl flex flex-col shadow-2xl overflow-hidden">
        <div className="flex justify-between items-center p-4 border-b bg-gray-50"><h3 className="font-bold text-gray-800 text-lg">{title}</h3><button onClick={onClose} className="p-2 hover:bg-gray-200 rounded-full transition-colors"><svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-6 h-6 text-gray-600"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" /></svg></button></div>
        <div className="flex-1 bg-gray-200 relative overflow-hidden">
            {renderContent()}
        </div>
      </div>
    </div>
  );
};

const Logo = ({ className = "h-20 w-auto" }: { className?: string }) => (
  <img 
    src="logo.png" 
    alt="EcoCity" 
    className={`${className} object-contain`} 
  />
);

function App() {
  const [config, setConfig] = useState<AppConfig>(DEFAULT_CONFIG);
  
  // Auth State
  const [user, setUser] = useState<User | null>(null);
  const [emailInput, setEmailInput] = useState('');
  const [passwordInput, setPasswordInput] = useState('');
  const [loginError, setLoginError] = useState('');
  
  // App Data State
  const [view, setView] = useState<AppView>(AppView.LOGIN);
  const [approvals, setApprovals] = useState<AirtableRecord[]>([]);
  const [approvalsMap, setApprovalsMap] = useState<Record<string, AirtableRecord[]>>({});
  const [paymentsMap, setPaymentsMap] = useState<Record<string, AirtableRecord>>({});
  const [contractsMap, setContractsMap] = useState<Record<string, AirtableRecord>>({});
  
  // Schema & Milestone State
  const [schemaTables, setSchemaTables] = useState<any[]>([]);
  const [availableMilestones, setAvailableMilestones] = useState<AirtableRecord[]>([]);
  const [milestoneTableId, setMilestoneTableId] = useState<string | null>('tblYcPhs2okqeqNBx'); 
  const [isEditingMilestone, setIsEditingMilestone] = useState(false);
  const [selectedMilestoneId, setSelectedMilestoneId] = useState('');
  
  // Filter State
  const [filter, setFilter] = useState<FilterType>('WAITING');
  const [projectFilter, setProjectFilter] = useState<string>('');
  const [supplierFilter, setSupplierFilter] = useState<string>('');
  
  // View Mode
  const [listMode, setListMode] = useState<ListMode>('CARDS');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  
  // Bulk Action State
  const [bulkAction, setBulkAction] = useState<ActionType>(null);

  // Detail View State
  const [selectedApproval, setSelectedApproval] = useState<AirtableRecord | null>(null);
  const [linkedPayment, setLinkedPayment] = useState<AirtableRecord | null>(null);
  const [linkedContract, setLinkedContract] = useState<AirtableRecord | null>(null);
  const [paymentApprovals, setPaymentApprovals] = useState<AirtableRecord[]>([]);
  const [relatedPayments, setRelatedPayments] = useState<AirtableRecord[]>([]);
  
  // Action State
  const [activeAction, setActiveAction] = useState<ActionType>(null);
  const [reasonText, setReasonText] = useState('');
  const [transferList, setTransferList] = useState<User[]>([]);
  const [selectedTransferUser, setSelectedTransferUser] = useState<string>('');
  const [currentDepartment, setCurrentDepartment] = useState<string>('');
  
  // Modal State
  const [modalDoc, setModalDoc] = useState<{ url: string; title: string } | null>(null);
  
  // UI State
  const [loading, setLoading] = useState(false);

  // --- Initial Schema Fetch ---
  useEffect(() => {
    const loadSchema = async () => {
        const tables = await fetchBaseSchema(config);
        if (tables.length > 0) {
            console.log("Schema Loaded:", tables);
            setSchemaTables(tables);
            
            // Try to find the Milestones table dynamically, but default to 'tblYcPhs2okqeqNBx'
            const msTable = tables.find((t: any) => 
               t.id === 'tblYcPhs2okqeqNBx' ||
               t.name === 'אבני דרך לחוזים' || 
               t.name === 'אבני דרך'
            );
            if (msTable) {
                setMilestoneTableId(msTable.id);
            }
        }
    };
    loadSchema();
  }, []);

  // --- Derived State for Filters ---
  const { uniqueProjects, uniqueSuppliers } = useMemo(() => {
    const projects = new Set<string>();
    const suppliers = new Set<string>();

    approvals.forEach(a => {
      // Basic pre-filter check here as well for consistency
      if (!a.fields[config.fieldApprovalStatus]) return;

      const pStr = s(f(a, config, 'fieldApprovalProject'));
      if (pStr) projects.add(pStr);

      const sStr = s(f(a, config, 'fieldApprovalSupplier'));
      if (sStr) suppliers.add(sStr);
    });

    return {
      uniqueProjects: Array.from(projects).sort(),
      uniqueSuppliers: Array.from(suppliers).sort()
    };
  }, [approvals, config]);

  // --- Counts Logic ---
  const { waitingCount, delayedCount, rejectedCount, totalCount } = useMemo(() => {
    let waiting = 0, delayed = 0, rejected = 0;

    const relevantApprovals = approvals.filter(r => {
        const status = r.fields[config.fieldApprovalStatus];
        if (!status) return false; // Exclude empty status
        // Global Filter: Exclude Approved
        if (status === config.statusSignedValue || status === 'אושר') return false;

        const pStr = s(f(r, config, 'fieldApprovalProject'));
        const sStr = s(f(r, config, 'fieldApprovalSupplier'));
        if (projectFilter && pStr !== projectFilter) return false;
        if (supplierFilter && sStr !== supplierFilter) return false;
        return true;
    });

    relevantApprovals.forEach(r => {
      const status = r.fields[config.fieldApprovalStatus]; 
      if (status === config.statusWaitingValue || status === 'ממתין') waiting++;
      else if (status === config.statusRejectedValue || status === 'נדחה' || status === 'דחה') rejected++;
      else if (status === config.statusDelayedValue || status === 'עיכוב' || status === 'עיקוב' || status === 'עכב') delayed++;
    });

    return { 
      waitingCount: waiting, 
      delayedCount: delayed, 
      rejectedCount: rejected,
      totalCount: relevantApprovals.length 
    };
  }, [approvals, config, projectFilter, supplierFilter]);

  // --- Filter Logic ---
  const filteredApprovals = useMemo(() => {
    return approvals.filter(r => {
      const status = r.fields[config.fieldApprovalStatus];
      if (!status) return false; // Exclude empty status
      // Global Filter: Exclude Approved
      if (status === config.statusSignedValue || status === 'אושר') return false;

      const pStr = s(f(r, config, 'fieldApprovalProject'));
      const sStr = s(f(r, config, 'fieldApprovalSupplier'));

      if (filter === 'WAITING' && status !== config.statusWaitingValue && status !== 'ממתין') return false;
      if (filter === 'REJECTED' && status !== config.statusRejectedValue && status !== 'נדחה' && status !== 'דחה') return false;
      if (filter === 'DELAYED' && status !== config.statusDelayedValue && status !== 'עיכוב' && status !== 'עיקוב' && status !== 'עכב') return false;

      if (projectFilter && pStr !== projectFilter) return false;
      if (supplierFilter && sStr !== supplierFilter) return false;

      return true;
    });
  }, [approvals, filter, projectFilter, supplierFilter, config]);

  // Reset selections when filters change
  useEffect(() => {
    setSelectedIds(new Set());
  }, [filter, projectFilter, supplierFilter, listMode]);

  // --- Data Loading Handlers ---
  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoginError('');
    setLoading(true);
    try {
      const loggedUser = await loginUser(config, emailInput);
      if (loggedUser) {
        if (loggedUser.password && String(loggedUser.password) !== passwordInput) {
           setLoginError('סיסמא שגויה');
           setLoading(false);
           return;
        }
        setUser(loggedUser);
        setView(AppView.LIST);
        fetchData(loggedUser);
      } else {
        setLoginError('משתמש לא נמצא');
      }
    } catch (err) {
      setLoginError('שגיאת התחברות. בדוק חיבור לרשת.');
    } finally {
      setLoading(false);
    }
  };

  const fetchData = async (currentUser: User) => {
    setLoading(true);
    try {
      const data = await fetchUserApprovals(config, currentUser);
      setApprovals(data);
      
      const paymentIds = Array.from(new Set(data.map(r => s(r.fields[config.fieldPaymentLink]))).values()).filter(id => id);
      
      if (paymentIds.length > 0) {
        const [payments, relatedApprovals] = await Promise.all([
            fetchPaymentsByIds(config, paymentIds),
            fetchApprovalsByPaymentIDs(config, paymentIds)
        ]);
        
        const map: Record<string, AirtableRecord> = {};
        payments.forEach(p => map[p.id] = p);
        setPaymentsMap(map);

        // Map Related Approvals to Payment ID
        const appMap: Record<string, AirtableRecord[]> = {};
        relatedApprovals.forEach(a => {
            const pid = s(a.fields[config.fieldPaymentLink]);
            if(pid) {
                if (!appMap[pid]) appMap[pid] = [];
                appMap[pid].push(a);
            }
        });
        setApprovalsMap(appMap);
      }

      const contractIds = Array.from(new Set(data.map(r => s(f(r, config, 'fieldApprovalContractLink')))).values()).filter(id => id);
      if (contractIds.length > 0) {
        const contracts = await fetchContractsByIds(config, contractIds);
        const cmap: Record<string, AirtableRecord> = {};
        contracts.forEach(c => {
             cmap[c.id] = c;
             const recId = s(c.fields[config.fieldContractRecId || 'RecID']);
             if (recId) cmap[recId] = c;
        });
        setContractsMap(cmap);
      }

    } catch (err) {
      console.error(err);
      alert('שגיאה בטעינת נתונים');
    } finally {
      setLoading(false);
    }
  };
  
  const handleRefresh = () => { if (user) fetchData(user); };
  const handleLogout = () => { setUser(null); setEmailInput(''); setPasswordInput(''); setView(AppView.LOGIN); setProjectFilter(''); setSupplierFilter(''); setFilter('WAITING'); };

  const handleApprovalClick = async (approval: AirtableRecord) => {
    setLoading(true);
    setSelectedApproval(approval);
    setLinkedPayment(null);
    setLinkedContract(null);
    setPaymentApprovals([]);
    setRelatedPayments([]);
    setAvailableMilestones([]); // Reset milestones
    setIsEditingMilestone(false);
    
    const paymentRecId = s(approval.fields[config.fieldPaymentLink]);
    const contractRecId = s(f(approval, config, 'fieldApprovalContractLink'));

    if (paymentRecId) {
      const [paymentData, contractData, allApprovals] = await Promise.all([
        fetchPaymentDetails(config, paymentRecId),
        fetchContract(config, contractRecId), 
        fetchApprovalsByPaymentID(config, paymentRecId)
      ]);
      setLinkedPayment(paymentData);
      setLinkedContract(contractData);
      setPaymentApprovals(allApprovals);

      if (paymentData) {
          const project = s(f(paymentData, config, 'fieldPaymentProject'));
          const supplier = s(f(paymentData, config, 'fieldPaymentSupplier'));
          if (project && supplier) {
              fetchRelatedPayments(config, project, supplier).then(setRelatedPayments);
          }
      }

      // --- Milestone Fetching Logic ---
      if (contractData) {
          const tableId = milestoneTableId || 'tblYcPhs2okqeqNBx';
          const contractRecVal = contractData.fields['RecID'] || contractData.fields[config.fieldContractRecId || 'RecID'] || '';
          
          let fetchedMilestones: AirtableRecord[] = [];

          // 1. Attempt to fetch via direct Link in Contract table
          const milestoneFieldKey = Object.keys(contractData.fields).find(k => 
              k.includes('אבני דרך') || 
              k.includes('Milestones') || 
              k.includes('Steps')
          );

          if (milestoneFieldKey) {
             const linkedIds = contractData.fields[milestoneFieldKey];
             if (Array.isArray(linkedIds) && linkedIds.length > 0) {
                 const formula = `OR(${linkedIds.map((id: string) => `RECORD_ID()='${id}'`).join(',')})`;
                 try {
                    fetchedMilestones = await fetchTableRecords(config, tableId, formula, false);
                 } catch (e) {
                    console.warn("Failed to fetch milestones via direct link IDs", e);
                 }
             }
          }

          // 2. Fallback: Search in Milestones table for Contract reference
          if (fetchedMilestones.length === 0) {
              // Try searching by Contract ID or Contract RecID in 'חוזה' or 'Contract' fields
              const formula = `OR(
                 SEARCH('${contractData.id}', {חוזה}) > 0, 
                 SEARCH('${contractData.id}', {Contract}) > 0, 
                 SEARCH('${contractRecVal}', {חוזה}) > 0, 
                 SEARCH('${contractRecVal}', {Contract}) > 0
              )`;
              
              try {
                  fetchedMilestones = await fetchTableRecords(config, tableId, formula, true);
              } catch (e) {
                  console.error("Error fetching milestones via search:", e);
              }
          }

          // Sort and Set
          if (fetchedMilestones.length > 0) {
              const sorted = fetchedMilestones.sort((a, b) => {
                  const getNum = (r: AirtableRecord) => {
                      // Prioritize 'אבן דרך מספר' for sorting as requested
                      const v = r.fields['אבן דרך מספר'] || r.fields['סעיף'] || r.fields['מספר סעיף'];
                      if (typeof v === 'number') return v;
                      if (v) return parseFloat(String(v));
                      return 999999;
                  };
                  return getNum(a) - getNum(b);
              });
              setAvailableMilestones(sorted);
          } else {
              console.warn("No milestones found for contract:", contractData.id);
          }
      }
    }
    setView(AppView.DETAIL);
    setLoading(false);
  };

  const updateMilestone = async () => {
      if (!selectedApproval || !selectedMilestoneId) return;
      setLoading(true);
      try {
          const milestoneRec = availableMilestones.find(m => m.id === selectedMilestoneId);
          
          // Extract proper values based on user feedback
          let newSectionNum = s(milestoneRec?.fields['מספר סעיף בחוזה']) || s(milestoneRec?.fields['מספר סעיף']) || s(milestoneRec?.fields['סעיף']) || s(milestoneRec?.fields['אבן דרך מספר']) || '';
          const valContent = s(milestoneRec?.fields['תוכן אבן דרך']) || s(milestoneRec?.fields['תוכן']) || s(milestoneRec?.fields['טקסט מלא']) || s(milestoneRec?.fields['טקסט מלא אבן דרך']) || s(milestoneRec?.fields['טקסט מלא אבן דרך']) || s(milestoneRec?.fields['טקסט מלא אבן דרך']) || s(milestoneRec?.fields['תאור']) || s(milestoneRec?.fields['Description']);
          
          let newFullText = valContent || '';
          let newMilestoneNum = s(milestoneRec?.fields['אבן דרך מספר']);

          if (newSectionNum.length > 15 && !newFullText) {
              newFullText = newSectionNum;
              newSectionNum = ''; 
          }
          
          // 1. Update Payment Record in Airtable (Link the milestone record ID)
          if (linkedPayment) {
              await updateRecordFields(config, config.paymentTableId, linkedPayment.id, {
                  [config.fieldMilestoneLink]: [selectedMilestoneId] 
              });
              
              // Safe Local Update
               setLinkedPayment(prev => {
                   if (!prev) return null;
                   return {
                       ...prev,
                       fields: {
                           ...prev.fields,
                           [config.fieldMilestoneLink]: [selectedMilestoneId],
                           [config.fieldMilestoneSection]: newSectionNum
                       }
                   };
               });
          }
          
          // 2. Local Update for Approval
          setSelectedApproval(prev => {
              if (!prev) return null;
              return {
                  ...prev,
                  fields: {
                      ...prev.fields,
                      [config.fieldMilestoneSection]: newSectionNum,
                      ['טקסט מלא אבן דרך']: newFullText,
                      ['אבן דרך מספר']: newMilestoneNum
                  }
              };
          });

          // 3. Update Global List State (Approvals)
          setApprovals(prevApprovals => prevApprovals.map(appr => {
              if (appr.id === selectedApproval.id) {
                  return {
                      ...appr,
                      fields: {
                          ...appr.fields,
                          [config.fieldMilestoneSection]: newSectionNum,
                          ['טקסט מלא אבן דרך']: newFullText,
                          ['אבן דרך מספר']: newMilestoneNum
                      }
                  };
              }
              return appr;
          }));
          
          setIsEditingMilestone(false);
      } catch (e) {
          console.error(e);
          alert('שגיאה בעדכון אבן דרך');
      } finally {
          setLoading(false);
      }
  };

  const handleBackToList = () => { setSelectedApproval(null); setLinkedPayment(null); setLinkedContract(null); setView(AppView.LIST); };

  // ... (Transfer and Action Logic remain same)
  const handleTransferClick = async () => {
    if (!selectedApproval) return;
    setLoading(true);
    let department = selectedApproval.fields[config.fieldDepartment]; 
    const deptString = s(department);
    setCurrentDepartment(deptString);

    try {
      const employees = await fetchEmployeesByDepartment(config, deptString);
      const filteredEmployees = employees.filter(e => e.id !== user?.id);
      setTransferList(filteredEmployees);
      setActiveAction('TRANSFER');
    } catch (e) {
      alert('שגיאה בטעינת רשימת עובדים.');
    } finally {
      setLoading(false);
    }
  };

  const executeTransfer = async () => {
    if (!selectedApproval || !selectedTransferUser) return;
    setLoading(true);
    try {
      await updateApprovalAssignee(config, selectedApproval.id, selectedTransferUser);
      await updateApprovalStatus(config, selectedApproval.id, config.statusWaitingValue, {
         [config.fieldRejectionReason]: null,
         [config.fieldDelayReason]: null
      });
      if (user) await fetchData(user);
      handleBackToList();
    } catch (e) {
      alert('שגיאה בהעברת האחריות');
    } finally {
      setLoading(false);
    }
  };

  const executeAction = async (signatureUrl?: string) => {
    if (!selectedApproval || !user || !activeAction) return;
    
    setLoading(true);
    try {
      let status = '';
      let extraFields = {};
      if (activeAction === 'APPROVE' && signatureUrl) {
        status = config.statusSignedValue;
        const dateStr = new Date().toLocaleDateString('en-GB');
        const safeSignerName = (user.name.replace(/[^\x00-\x7F]/g, "")).trim() || user.email.split('@')[0];
        const serial = s(selectedApproval.fields[config.fieldApprovalSerial]) || selectedApproval.id;
        const stampText = `ECOCITY CERTIFIED   |   APPROVED BY: ${safeSignerName}   |   DATE: ${dateStr}   |   ID: ${serial}`;
        const compositeUrl = `https://placehold.co/600x200/ffffff/000000/png?text=${encodeURIComponent(stampText)}&font=roboto`;
        extraFields = { 
          [config.fieldSignature]: [{ url: compositeUrl, filename: `Ecocity_Cert_${serial}.png` }],
          [config.fieldRejectionReason]: null,
          [config.fieldDelayReason]: null
        };
      } else if (activeAction === 'REJECT') {
        status = config.statusRejectedValue;
        extraFields = { [config.fieldRejectionReason]: reasonText, [config.fieldDelayReason]: null };
      } else if (activeAction === 'DELAY') {
        status = config.statusDelayedValue;
        extraFields = { [config.fieldDelayReason]: reasonText, [config.fieldRejectionReason]: null };
      }
      await updateApprovalStatus(config, selectedApproval.id, status, extraFields);
      await fetchData(user); 
      handleBackToList();
    } catch (e) {
      console.error(e);
      alert('שגיאה בעדכון');
    } finally {
      setLoading(false);
    }
  };

  const handleSelectAll = () => {
    if (selectedIds.size === filteredApprovals.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(filteredApprovals.map(r => r.id)));
    }
  };

  const handleSelectRow = (id: string) => {
    const newSet = new Set(selectedIds);
    if (newSet.has(id)) newSet.delete(id);
    else newSet.add(id);
    setSelectedIds(newSet);
  };

  // Bulk Logic
  const handleBulkClick = (action: ActionType) => {
      setReasonText('');
      setSelectedTransferUser('');
      
      if (action === 'TRANSFER') {
          const firstId = Array.from(selectedIds)[0];
          const record = approvals.find(r => r.id === firstId);
          if (record) {
               const dept = s(record.fields[config.fieldDepartment]);
               setCurrentDepartment(dept);
               setLoading(true);
               fetchEmployeesByDepartment(config, dept).then(emps => {
                   setTransferList(emps.filter(e => e.id !== user?.id));
                   setLoading(false);
                   setBulkAction(action);
               }).catch(() => {
                   setLoading(false);
                   alert('שגיאה בטעינת רשימת עובדים');
               });
          } else {
              setBulkAction(action);
          }
      } else {
          setBulkAction(action);
      }
  };

  const executeBulkAction = async () => {
    if (!user || !bulkAction) return;
    
    setLoading(true);
    try {
        const recordsToUpdate = approvals.filter(a => selectedIds.has(a.id));
        const dateStr = new Date().toLocaleDateString('en-GB');
        const safeSignerName = (user.name.replace(/[^\x00-\x7F]/g, "")).trim() || user.email.split('@')[0];

        // Process in chunks or Promise.all to speed up? Airtable rate limit is 5 req/sec. Serial is safer.
        for (const record of recordsToUpdate) {
             if (bulkAction === 'APPROVE') {
                 const serial = s(record.fields[config.fieldApprovalSerial]) || record.id;
                 const stampText = `ECOCITY CERTIFIED   |   APPROVED BY: ${safeSignerName}   |   DATE: ${dateStr}   |   ID: ${serial}`;
                 const compositeUrl = `https://placehold.co/600x200/ffffff/000000/png?text=${encodeURIComponent(stampText)}&font=roboto`;
                 const extraFields = { 
                   [config.fieldSignature]: [{ url: compositeUrl, filename: `Ecocity_Cert_${serial}.png` }],
                   [config.fieldRejectionReason]: null,
                   [config.fieldDelayReason]: null
                 };
                 await updateApprovalStatus(config, record.id, config.statusSignedValue, extraFields);
             
             } else if (bulkAction === 'REJECT') {
                 const extraFields = { [config.fieldRejectionReason]: reasonText, [config.fieldDelayReason]: null };
                 await updateApprovalStatus(config, record.id, config.statusRejectedValue, extraFields);
             
             } else if (bulkAction === 'DELAY') {
                 const extraFields = { [config.fieldDelayReason]: reasonText, [config.fieldRejectionReason]: null };
                 await updateApprovalStatus(config, record.id, config.statusDelayedValue, extraFields);
             
             } else if (bulkAction === 'TRANSFER') {
                 if (selectedTransferUser) {
                    await updateApprovalAssignee(config, record.id, selectedTransferUser);
                    // Reset status to Waiting if it wasn't already
                    await updateApprovalStatus(config, record.id, config.statusWaitingValue, {
                        [config.fieldRejectionReason]: null,
                        [config.fieldDelayReason]: null
                    });
                 }
             }
        }
        
        await fetchData(user);
        setSelectedIds(new Set());
        setBulkAction(null);
    } catch (e) {
        console.error(e);
        alert('שגיאה בביצוע פעולה גורפת');
    } finally {
        setLoading(false);
    }
  };

  const renderBulkModal = () => {
      if (!bulkAction) return null;
      
      const count = selectedIds.size;
      let title = '';
      let content = null;
      let confirmText = 'אשר';
      let colorClass = 'bg-ecogreen-600 hover:bg-ecogreen-700';

      if (bulkAction === 'APPROVE') {
          title = 'אישור גורף';
          content = <p className="text-gray-600">האם אתה בטוח שברצונך לאשר <strong className="text-gray-900">{count}</strong> פריטים שנבחרו?</p>;
          confirmText = 'אשר הכל';
      } else if (bulkAction === 'REJECT') {
          title = 'דחייה גורפת';
          colorClass = 'bg-red-600 hover:bg-red-700';
          content = (
              <div>
                  <p className="text-gray-600 mb-2">נא להזין סיבת דחייה עבור <strong className="text-gray-900">{count}</strong> הפריטים:</p>
                  <textarea className="w-full p-3 border rounded-lg focus:ring-2 focus:ring-red-500 outline-none" rows={3} value={reasonText} onChange={e => setReasonText(e.target.value)} placeholder="סיבת הדחייה..." />
              </div>
          );
          confirmText = 'דחה הכל';
      } else if (bulkAction === 'DELAY') {
          title = 'עיכוב גורף';
          colorClass = 'bg-orange-500 hover:bg-orange-600';
          content = (
              <div>
                  <p className="text-gray-600 mb-2">נא להזין סיבת עיכוב עבור <strong className="text-gray-900">{count}</strong> הפריטים:</p>
                  <textarea className="w-full p-3 border rounded-lg focus:ring-2 focus:ring-orange-500 outline-none" rows={3} value={reasonText} onChange={e => setReasonText(e.target.value)} placeholder="סיבת העיכוב..." />
              </div>
          );
          confirmText = 'עכב הכל';
      } else if (bulkAction === 'TRANSFER') {
          title = 'העברה גורפת';
          colorClass = 'bg-sky-600 hover:bg-sky-700';
          content = (
              <div>
                  <p className="text-gray-600 mb-2">בחר עובד להעברת <strong className="text-gray-900">{count}</strong> הפריטים (ממחלקה: {currentDepartment}):</p>
                  <select className="w-full p-3 border rounded-lg focus:ring-2 focus:ring-sky-500 outline-none bg-white" value={selectedTransferUser} onChange={e => setSelectedTransferUser(e.target.value)}>
                      <option value="">בחר עובד...</option>
                      {transferList.map(emp => <option key={emp.id} value={emp.id}>{emp.name}</option>)}
                  </select>
                  {transferList.length === 0 && <p className="text-xs text-red-500 mt-1">לא נמצאו עובדים להעברה במחלקה זו.</p>}
              </div>
          );
          confirmText = 'העבר הכל';
      }

      return (
          <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black bg-opacity-60 backdrop-blur-sm animate-in fade-in">
              <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6 mx-4 transform transition-all scale-100">
                  <h3 className="text-xl font-bold text-gray-900 mb-4">{title}</h3>
                  <div className="mb-6">{content}</div>
                  <div className="flex justify-end gap-3">
                      <button onClick={() => setBulkAction(null)} className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-lg font-medium transition-colors">ביטול</button>
                      <button 
                        onClick={executeBulkAction} 
                        disabled={(bulkAction !== 'APPROVE' && !reasonText && !selectedTransferUser)} 
                        className={`px-6 py-2 text-white rounded-lg font-bold shadow-md transition-all disabled:opacity-50 disabled:cursor-not-allowed ${colorClass}`}
                      >
                          {confirmText}
                      </button>
                  </div>
              </div>
          </div>
      );
  };

  const renderActionArea = () => {
    if (activeAction === 'APPROVE') {
      return (
        <div className="mt-4 p-4 border-t bg-gray-50 rounded-lg shadow-inner w-full">
           <h3 className="font-bold mb-2 text-ecogreen-700">חתימה לאישור</h3>
           <p className="text-xs text-gray-500 mb-2 bg-white p-2 rounded border border-gray-100"><strong className="block text-gray-700 mb-1">שים לב:</strong>בעת האישור, תופק <strong>חותמת דיגיטלית רשמית</strong> עם שמך והתאריך, המהווה אישור חוקי במערכת.</p>
           <SignaturePad onSave={(url) => executeAction(url)} onCancel={() => setActiveAction(null)} />
        </div>
      );
    }
    if (activeAction === 'REJECT' || activeAction === 'DELAY') {
      return (
        <div className="mt-4 p-4 border-t bg-gray-50 animate-in fade-in rounded-lg shadow-inner w-full">
          <h3 className={`font-bold mb-2 ${activeAction === 'REJECT' ? 'text-red-600' : 'text-orange-600'}`}>{activeAction === 'REJECT' ? 'דחיית תשלום' : 'עיכוב תשלום'}</h3>
          <label className="block text-sm mb-1 text-gray-700">{activeAction === 'REJECT' ? 'סיבת הדחייה (חובה):' : 'סיבת העיכוב (חובה):'}</label>
          <textarea className="w-full p-2 border rounded-md mb-3 h-24 focus:ring-2 focus:outline-none bg-white" style={{ borderColor: activeAction === 'REJECT' ? '#fca5a5' : '#fdba74', '--tw-ring-color': activeAction === 'REJECT' ? '#ef4444' : '#f97316' } as any} value={reasonText} onChange={e => setReasonText(e.target.value)} placeholder="פרט כאן..." />
          <div className="flex gap-2 justify-end"><button onClick={() => setActiveAction(null)} className="px-4 py-2 bg-gray-200 rounded text-gray-800 hover:bg-gray-300 transition-colors">ביטול</button><button onClick={() => executeAction()} disabled={!reasonText.trim()} className={`px-4 py-2 text-white rounded disabled:opacity-50 font-bold shadow-sm transition-all ${activeAction === 'REJECT' ? 'bg-red-600 hover:bg-red-700' : 'bg-orange-500 hover:bg-orange-600'}`}>אישור</button></div>
        </div>
      );
    }
    if (activeAction === 'TRANSFER') {
      if (transferList.length === 0) return (<div className="mt-4 p-6 border-t bg-gray-50 animate-in fade-in rounded-lg shadow-inner text-center w-full"><div className="w-16 h-16 bg-gray-200 rounded-full flex items-center justify-center mx-auto mb-4 text-4xl">🤷‍♂️</div><h3 className="font-bold text-gray-800 text-lg mb-2">אופס, אין למי להעביר...</h3><p className="text-gray-600 mb-6 leading-relaxed">לא נמצאו עובדים נוספים במחלקת <span className="font-bold text-gray-800 mx-1">{currentDepartment || 'לא ידוע'}</span> שניתן להעביר אליהם את האישור.</p><button onClick={() => setActiveAction(null)} className="px-6 py-2 bg-gray-800 text-white rounded-lg font-bold hover:bg-gray-900 transition-colors shadow-lg">הבנתי, סגור</button></div>);
      return (<div className="mt-4 p-4 border-t bg-gray-50 animate-in fade-in rounded-lg shadow-inner w-full"><h3 className="font-bold mb-1 text-sky-700">העברת אחריות חתימה</h3><p className="text-sm text-gray-600 mb-4">מחלקה: <span className="font-bold text-gray-800">{currentDepartment}</span></p><p className="text-sm text-gray-600 mb-2">בחר עובד מהמחלקה להעברת האישור:</p><select className="w-full p-2 border border-gray-300 rounded-lg mb-4 bg-white focus:ring-2 focus:ring-sky-500 outline-none" value={selectedTransferUser} onChange={e => setSelectedTransferUser(e.target.value)}><option value="">בחר עובד...</option>{transferList.map(emp => (<option key={emp.id} value={emp.id}>{emp.name}</option>))}</select><div className="flex gap-2 justify-end"><button onClick={() => setActiveAction(null)} className="px-4 py-2 bg-gray-200 rounded text-gray-800 hover:bg-gray-300 transition-colors">ביטול</button><button onClick={executeTransfer} disabled={!selectedTransferUser} className="px-4 py-2 bg-sky-600 text-white rounded disabled:opacity-50 font-bold hover:bg-sky-700 shadow-sm transition-all">בצע העברה</button></div></div>);
    }
    const currentStatus = selectedApproval?.fields[config.fieldApprovalStatus];
    const isApproved = currentStatus === config.statusSignedValue || currentStatus === 'אושר';
    const isRejected = currentStatus === config.statusRejectedValue || currentStatus === 'נדחה' || currentStatus === 'דחה';
    return (<div className="grid grid-cols-2 gap-3 mt-4 w-full"><button onClick={() => !isApproved && setActiveAction('APPROVE')} disabled={isApproved} className={`h-14 rounded-xl flex items-center justify-center gap-3 shadow-sm transition-all active:scale-[0.98] ${isApproved ? 'bg-gray-200 text-gray-400 cursor-not-allowed' : 'bg-ecogreen-600 text-white hover:bg-ecogreen-700'}`}><div className="p-1 bg-white/20 rounded-full"><svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={3} stroke="currentColor" className="w-5 h-5"><path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" /></svg></div><span className="font-bold text-sm">{isApproved ? 'כבר אושר' : 'אשר'}</span></button><button onClick={() => !isRejected && setActiveAction('REJECT')} disabled={isRejected} className={`h-14 rounded-xl flex items-center justify-center gap-3 shadow-sm transition-all active:scale-[0.98] ${isRejected ? 'bg-gray-200 text-gray-400 cursor-not-allowed' : 'bg-red-500 text-white hover:bg-red-600'}`}><div className="p-1 bg-white/20 rounded-full"><svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor" className="w-5 h-5"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" /></svg></div><span className="font-bold text-sm">{isRejected ? 'כבר נדחה' : 'דחה'}</span></button><button onClick={() => setActiveAction('DELAY')} className="h-14 rounded-xl bg-orange-500 text-white hover:bg-orange-600 flex items-center justify-center gap-3 shadow-sm transition-all active:scale-[0.98]"><div className="p-1 bg-white/20 rounded-full"><svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor" className="w-5 h-5"><path strokeLinecap="round" strokeLinejoin="round" d="M15.75 5.25v13.5m-7.5-13.5v13.5" /></svg></div><span className="font-bold text-sm">עכב</span></button><button onClick={handleTransferClick} className="h-14 rounded-xl bg-sky-500 text-white hover:bg-sky-600 flex items-center justify-center gap-3 shadow-sm transition-all active:scale-[0.98]"><div className="p-1 bg-white/20 rounded-full"><svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor" className="w-5 h-5"><path strokeLinecap="round" strokeLinejoin="round" d="M7.5 21 3 16.5m0 0L7.5 12M3 16.5h13.5m0-13.5L21 7.5m0 0L16.5 12M21 7.5H7.5" /></svg></div><span className="font-bold text-sm">העבר</span></button></div>);
  };

  // --- Views ---
  if (view === AppView.LOGIN) {
    return (
      <BackgroundContainer>
        <div className="flex-1 flex flex-col items-center justify-center p-4">
          <div className="w-full max-w-md bg-white/95 backdrop-blur-md rounded-2xl shadow-2xl p-8 border border-white/20">
            <div className="flex justify-center mb-6">
              <Logo className="h-24 w-auto" />
            </div>
            <h2 className="text-2xl font-bold text-center text-gray-800 mb-2">Eco-City Portal</h2>
            <form onSubmit={handleLogin} className="space-y-4 mt-6">
              <input 
                type="email" 
                required 
                className="w-full px-4 py-3 border border-gray-300 rounded-xl outline-none focus:ring-2 focus:ring-ecogreen-500 bg-white/80 text-gray-900 placeholder-gray-500" 
                value={emailInput} 
                onChange={e => setEmailInput(e.target.value)} 
                placeholder="user@ecocity.co.il" 
              />
              <input 
                type="password" 
                required 
                className="w-full px-4 py-3 border border-gray-300 rounded-xl outline-none focus:ring-2 focus:ring-ecogreen-500 bg-white/80 text-gray-900 placeholder-gray-500" 
                value={passwordInput} 
                onChange={e => setPasswordInput(e.target.value)} 
                placeholder="••••" 
              />
              {loginError && <p className="text-red-500 text-sm text-center font-medium bg-red-50 p-2 rounded">{loginError}</p>}
              <button 
                type="submit" 
                disabled={loading} 
                className="w-full bg-ecogreen-600 text-white py-3 rounded-xl font-bold hover:bg-ecogreen-700 transition-colors shadow-md"
              >
                {loading ? 'מתחבר...' : 'כניסה'}
              </button>
            </form>
          </div>
          <div className="mt-8 text-gray-400 text-xs font-medium">© Ecocity 2025</div>
        </div>
      </BackgroundContainer>
    );
  }

  // --- DETAIL VIEW ---
  if (view === AppView.DETAIL) {
    const contractUrl = getPdfUrl(linkedContract, config.fieldContractAttachments); 
    const invoiceUrl = getPdfUrl(linkedPayment, config.fieldPaymentAttachments);
    
    const description = s(f(selectedApproval, config, 'fieldApprovalDescription')) || s(f(linkedPayment, config, 'fieldPaymentDescription')) || 'הוראת תשלום';
    // Use the field accessor for milestone text to ensure it updates from local state changes
    const milestoneText = selectedApproval?.fields['טקסט מלא אבן דרך']; 
    const contractSection = selectedApproval?.fields[config.fieldMilestoneSection];
    
    // UPDATED: Check directly for 'אבן דרך מספר' on the Approval record
    const milestoneNum = s(selectedApproval?.fields['אבן דרך מספר']) || s(f(selectedApproval, config, 'fieldMilestoneNumber'));

    const currentStatus = selectedApproval?.fields[config.fieldApprovalStatus] || 'ממתין';
    
    let sidebarStatusColor = 'text-gray-900 bg-gray-100'; 
    let sidebarBorderColor = 'bg-gray-400'; 
    if (currentStatus === config.statusWaitingValue || currentStatus === 'ממתין') { sidebarStatusColor = 'text-yellow-900 bg-yellow-100'; sidebarBorderColor = 'bg-yellow-400'; }
    else if (currentStatus === config.statusSignedValue || currentStatus === 'אושר') { sidebarStatusColor = 'text-green-900 bg-green-100'; sidebarBorderColor = 'bg-ecogreen-500'; }
    else if (currentStatus === config.statusRejectedValue || currentStatus === 'נדחה') { sidebarStatusColor = 'text-red-900 bg-red-100'; sidebarBorderColor = 'bg-red-500'; }
    else if (currentStatus === config.statusDelayedValue || currentStatus === 'עיקוב' || currentStatus === 'עיכוב') { sidebarStatusColor = 'text-orange-900 bg-orange-100'; sidebarBorderColor = 'bg-orange-500'; }

    let contractBalance = f(linkedContract, config, 'fieldContractBalance');
    if (!contractBalance && linkedContract) {
         const sum = parseFloat(String(f(linkedContract, config, 'fieldContractSum') || '0'));
         const paid = parseFloat(String(f(linkedContract, config, 'fieldContractPaid') || '0'));
         if (!isNaN(sum) && !isNaN(paid)) {
             contractBalance = sum - paid;
         }
    }

    // Milestone Display Component (Reusable for Desktop and Mobile)
    const MilestoneDisplay = () => (
         <div className="bg-white border-t border-gray-200 p-3 grid grid-cols-3 gap-2 text-xs text-gray-600 border-b-2 border-amber-100">
             <div><span className="block font-bold text-gray-400 text-[10px] uppercase">נושא החוזה</span><span className="font-bold text-gray-800 line-clamp-1" title={s(f(linkedContract, config, 'fieldContractDesc'))}>{s(f(linkedContract, config, 'fieldContractDesc')) || '-'}</span></div>
             <div className="text-center"><span className="block font-bold text-gray-400 text-[10px] uppercase">תאריך</span><span className="font-bold text-gray-800">{formatDate(s(f(linkedContract, config, 'fieldContractDate')))}</span></div>
             <div className="text-left"><span className="block font-bold text-gray-400 text-[10px] uppercase">סכום החוזה</span><span className="font-bold text-gray-800">{formatCurrency(f(linkedContract, config, 'fieldContractSum'))}</span></div>
             {(milestoneNum || contractSection) && (
                 <div className="col-span-3 border-t border-gray-200 pt-2 mt-1 flex gap-4 text-xs">
                      {milestoneNum && <div className="text-amber-700 font-bold"><span className="text-gray-400 font-normal block text-[10px]">אבן דרך מספר</span> {s(milestoneNum)}</div>}
                      {contractSection && <div className="text-gray-700 font-bold"><span className="text-gray-400 font-normal block text-[10px]">סעיף בחוזה</span> {s(contractSection)}</div>}
                 </div>
             )}
         </div>
    );

    const MilestoneContent = () => (
         milestoneText ? (
            <div className="bg-amber-50 border-t border-amber-200 p-4 shrink-0 max-h-56 overflow-y-auto">
                <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                        <span className="text-amber-900 font-bold text-xs uppercase tracking-wider flex items-center gap-1">תוכן אבן דרך</span>
                    </div>
                    <button onClick={() => setIsEditingMilestone(!isEditingMilestone)} className="text-xs text-amber-700 underline font-bold hover:text-amber-900">{isEditingMilestone ? 'ביטול עריכה' : 'שנה אבן דרך'}</button>
                </div>
                
                {isEditingMilestone && (
                    <div className="mb-2">
                        {availableMilestones.length > 0 ? (
                           <div className="flex gap-2">
                                <select 
                                  className="flex-1 p-2 text-sm border border-amber-300 rounded bg-white text-gray-800"
                                  value={selectedMilestoneId}
                                  onChange={(e) => setSelectedMilestoneId(e.target.value)}
                                >
                                    <option value="">בחר אבן דרך חדשה...</option>
                                    {availableMilestones.map(m => {
                                        const msNum = s(m.fields['אבן דרך מספר']);
                                        const contractSec = s(m.fields['מספר סעיף בחוזה']) || s(m.fields['מספר סעיף']) || s(m.fields['סעיף']);
                                        const txt = s(m.fields['תוכן אבן דרך']) || s(m.fields['תוכן']) || s(m.fields['טקסט מלא']) || s(m.fields['טקסט מלא אבן דרך']) || s(m.fields['טקסט מלא אבן דרך']) || s(m.fields['טקסט מלא אבן דרך']) || s(m.fields['תאור']) || s(m.fields['Description']) || m.id;
                                        
                                        const truncateTxt = txt.length > 50 ? txt.substring(0, 50) + '...' : txt;
                                        
                                        let label = '';
                                        if (msNum) label += `אבן דרך ${msNum}: `;
                                        label += truncateTxt;
                                        if (contractSec && contractSec !== msNum) label += ` (סעיף בחוזה: ${contractSec})`;
                                        
                                        return (
                                            <option key={m.id} value={m.id}>
                                                {label}
                                            </option>
                                        );
                                    })}
                                </select>
                                <button onClick={updateMilestone} disabled={!selectedMilestoneId} className="px-3 py-1 bg-amber-600 text-white rounded text-xs font-bold hover:bg-amber-700 disabled:opacity-50">עדכן</button>
                           </div>
                        ) : (
                            <div className="text-xs text-amber-700 italic border border-amber-200 bg-amber-100/50 p-2 rounded">לא נמצאו אבני דרך מקושרות. וודא שקיים שדה קישור תקין בטבלת החוזים או אבני הדרך.</div>
                        )}
                    </div>
                )}

                <blockquote className="border-r-4 border-amber-400 bg-white p-4 rounded-l-lg text-gray-800 text-sm leading-relaxed shadow-sm">"{String(milestoneText)}"</blockquote>
            </div>
         ) : null
    );

    return (
      <BackgroundContainer>
        <div className="flex flex-col min-h-screen md:h-screen md:overflow-hidden bg-gray-100">
          {/* Enhanced Detail Header with Gradient Background */}
          <header className="h-24 bg-gradient-to-r from-slate-800 to-slate-900 flex items-center justify-between px-4 flex-shrink-0 z-30 shadow-md gap-4 sticky top-0 md:static">
             <div className="flex items-center gap-2 shrink-0 bg-white/10 p-1 rounded-lg backdrop-blur-sm"><Logo className="h-16 w-auto" /></div>
             <div className="flex flex-col items-center text-center overflow-hidden flex-1 px-2">
               <h2 className="text-white font-bold text-base md:text-xl leading-tight truncate w-full max-w-lg drop-shadow-md" title={description}>{description}</h2>
               <div className="flex items-center gap-2 text-xs text-blue-200 mt-0.5 whitespace-nowrap font-medium"><span>הוראה #{s(f(linkedPayment, config, 'fieldPaymentOrderNum'))}</span></div>
             </div>
             <button onClick={handleBackToList} className="shrink-0 bg-white/10 hover:bg-white/20 border border-white/20 text-white px-4 py-2 rounded-lg text-sm font-bold flex items-center gap-2 transition-colors backdrop-blur-md">חזור<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-4 h-4 rotate-180 hidden md:block"><path strokeLinecap="round" strokeLinejoin="round" d="M10.5 19.5 3 12m0 0 7.5-7.5M3 12h18" /></svg></button>
          </header>

          <div className="w-full bg-white border-b border-gray-200 p-3 overflow-x-auto shrink-0 z-20 shadow-sm custom-scrollbar sticky top-24 md:static">
             <div className="flex items-center gap-4 min-w-max px-2">
                {paymentApprovals.map((appr, idx) => {
                   const status = appr.fields[config.fieldApprovalStatus];
                   const isMe = appr.id === selectedApproval?.id;
                   const isWaiting = status === 'ממתין' || status === config.statusWaitingValue;
                   const isApproved = status === config.statusSignedValue || status === 'אושר';
                   const isRejected = status === config.statusRejectedValue || status === 'נדחה' || status === 'נדחה';
                   const isDelayed = status === config.statusDelayedValue || status === 'עכב' || status === 'עיקוב' || status === 'עיכוב';
                   let bgClass = 'bg-gray-100 border-gray-200';
                   let statusLabel = status; 
                   if (isWaiting) { bgClass = 'bg-yellow-50 border-yellow-300'; statusLabel = 'ממתין'; }
                   else if (isApproved) { bgClass = 'bg-ecogreen-50 border-ecogreen-300'; statusLabel = 'אושר'; }
                   else if (isRejected) { bgClass = 'bg-red-50 border-red-300'; statusLabel = 'נדחה'; }
                   else if (isDelayed) { bgClass = 'bg-orange-50 border-orange-300'; statusLabel = 'עוכב'; }

                   let empName = '';
                   if (config.fieldApprovalEmployeeNameLookup) {
                       empName = s(appr.fields[config.fieldApprovalEmployeeNameLookup]);
                   }
                   if (!empName || (typeof empName === 'string' && empName.startsWith('rec'))) {
                       const rawVal = f(appr, config, 'fieldApprovalEmployee');
                       let assigneeId = '';
                       if (typeof rawVal === 'object' && rawVal !== null && !Array.isArray(rawVal) && rawVal.name) {
                           empName = rawVal.name;
                       } else if (Array.isArray(rawVal) && rawVal.length > 0) {
                           if (typeof rawVal[0] === 'object' && rawVal[0].name) {
                               empName = rawVal[0].name;
                           } else {
                               assigneeId = String(rawVal[0]);
                           }
                       } else {
                           assigneeId = s(rawVal);
                       }
                       if (!empName || empName.startsWith('rec')) {
                            if (assigneeId === user?.id) {
                                empName = user?.name || 'אני';
                            } else if (assigneeId.startsWith('rec')) {
                                empName = 'עובד';
                            } else {
                                empName = assigneeId || '-';
                            }
                       }
                   }

                   return (
                      <div key={appr.id} className={`flex flex-col min-w-[140px] px-3 py-2 rounded-lg border-2 transition-all ${bgClass} ${isMe ? 'ring-4 ring-offset-2 ring-gray-400 shadow-xl scale-105 z-10' : 'opacity-90'}`}>
                         <div className="flex justify-between items-center mb-1"><span className="text-[10px] text-black font-mono font-bold">{formatDate(appr.createdTime)}</span><span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full border ${isMe ? 'bg-gray-800 text-white border-black' : 'bg-white/50 border-black/5 text-gray-900'}`}>#{idx + 1}</span></div>
                         <div className="font-bold text-sm text-black truncate" title={empName}>{empName}</div>
                         <div className="flex justify-between items-center mt-1 w-full pt-1 border-t border-black/5"><span className="text-[10px] font-bold text-black">{statusLabel}</span><span className="text-[10px] font-bold text-black">רץ: {s(f(appr, config, 'fieldApprovalSerial')) || '-'}</span></div>
                      </div>
                   )
                })}
             </div>
          </div>

          <div className="flex-1 flex flex-col md:flex-row md:overflow-hidden relative bg-gray-50">
            {/* Sidebar and Main content remains same as previous */}
            <aside className="w-full md:w-[400px] flex-shrink-0 flex flex-col border-b md:border-b-0 md:border-l border-gray-200 bg-white z-20 shadow-xl md:h-full md:overflow-y-auto relative order-1 md:order-1">
               <div className="p-6 pb-2">
                  <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 relative overflow-hidden">
                     <div className={`absolute top-0 right-0 w-2 h-full ${sidebarBorderColor}`}></div>
                     <div className="flex justify-between items-start mb-4 border-b border-gray-100 pb-3"><div><span className={`px-2.5 py-1 rounded-md text-xs font-bold tracking-wide shadow-sm ${sidebarStatusColor}`}>{currentStatus}</span></div><div className="text-right"><div className="text-[10px] text-black font-bold uppercase">מספר רץ</div><div className="font-mono font-bold text-black">#{s(f(selectedApproval, config, 'fieldApprovalSerial')) || selectedApproval?.id}</div></div></div>
                     <div className="mb-4"><div className="text-sm text-gray-500 mb-1">סה"כ לתשלום (ללא מע"מ)</div><div className="text-4xl font-black text-gray-900 tracking-tight">{formatCurrency(f(linkedPayment, config, 'fieldPaymentAmount'))}</div></div>
                     <div className="space-y-3 pt-3 border-t border-gray-100">
                        <div className="flex items-start gap-3"><div className="w-8 h-8 rounded-full bg-blue-50 flex items-center justify-center shrink-0 mt-0.5"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4 text-blue-600"><path fillRule="evenodd" d="M2.24 6.8a.75.75 0 0 0 1.06-.04l1.95-2.1 1.95 2.1a.75.75 0 1 0 1.1-1.02l-2.5-2.7a.75.75 0 0 0-1.1 0l-2.5 2.7a.75.75 0 0 0 .04 1.06Zm6.11 5.5a.75.75 0 0 0 1.06-.04l1.95-2.1 1.95 2.1a.75.75 0 1 0 1.1-1.02l-2.5-2.7a.75.75 0 0 0-1.1 0l-2.5 2.7a.75.75 0 0 0 .04 1.06Zm6.11 5.5a.75.75 0 0 0 1.06-.04l1.95-2.1 1.95 2.1a.75.75 0 1 0 1.1-1.02l-2.5-2.7a.75.75 0 0 0-1.1 0l-2.5 2.7a.75.75 0 0 0 .04 1.06Z" clipRule="evenodd" /></svg></div><div><div className="text-xs text-gray-400 font-bold uppercase tracking-wider">פרויקט</div><div className="font-bold text-gray-900 leading-tight">{s(f(selectedApproval, config, 'fieldApprovalProject')) || s(f(linkedPayment, config, 'fieldPaymentProject'))}</div></div></div>
                        <div className="flex items-start gap-3"><div className="w-8 h-8 rounded-full bg-purple-50 flex items-center justify-center shrink-0 mt-0.5"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4 text-purple-600"><path d="M10 9a3 3 0 1 0 0-6 3 3 0 0 0 0 6ZM6 8a2 2 0 1 1-4 0 2 2 0 0 1 4 0ZM1.49 15.326a.78.78 0 0 1-.358-.442 3 3 0 0 1 4.308-3.516 6.484 6.484 0 0 0-1.905 3.959c-.023.222-.014.442.025.654a4.97 4.97 0 0 1-2.07-.655ZM16.44 15.98a4.97 4.97 0 0 0 2.07-.654.78.78 0 0 0 .358-.442 3 3 0 0 0-4.308-3.517 6.484 6.484 0 0 1 1.905 3.96 6.765 6.765 0 0 1-.025.654Zm-4.57-2.23a4.994 4.994 0 0 1 0 8.374 5.051 5.051 0 0 0 0-8.374Zm2.597 3.84a2 2 0 1 1-4 0 2 2 0 0 1 4 0Z" /></svg></div><div><div className="text-xs text-gray-400 font-bold uppercase tracking-wider">ספק</div><div className="font-bold text-gray-900 leading-tight">{s(f(selectedApproval, config, 'fieldApprovalSupplier')) || s(f(linkedPayment, config, 'fieldPaymentSupplier'))}</div></div></div>
                     </div>
                  </div>
               </div>

               <div className="px-6 pb-6">
                  <h3 className="font-bold text-gray-900 mb-2 text-sm">פעולות</h3>
                  {renderActionArea()}
                  {selectedApproval?.fields[config.fieldRejectionReason] && <div className="text-xs text-red-700 bg-red-50 p-3 rounded-lg mt-4 border border-red-100 flex gap-2"><strong className="block mb-1">סיבת דחייה:</strong> {s(f(selectedApproval, config, 'fieldRejectionReason'))}</div>}
                  {selectedApproval?.fields[config.fieldDelayReason] && <div className="text-xs text-orange-700 bg-orange-50 p-3 rounded-lg mt-4 border border-orange-100 flex gap-2"><strong className="block mb-1">סיבת עיכוב:</strong> {s(f(selectedApproval, config, 'fieldDelayReason'))}</div>}
               </div>

               {/* Budget Summary */}
               <div className="p-6 pt-0">
                 <div className="bg-gray-800 rounded-xl p-4 text-white shadow-lg">
                   <h3 className="text-sm font-bold text-gray-300 mb-3 border-b border-gray-600 pb-2">ניצול תקציבי (מתוך חשבון זה)</h3>
                   <div className="grid grid-cols-2 gap-y-3 gap-x-4 text-xs">
                     <div><div className="text-gray-400">תקציב חברה מקור:</div><div className="font-mono font-bold text-sm">{formatCurrency(f(linkedPayment, config, 'fieldBudgetUtilLine'))}</div></div>
                     <div><div className="text-gray-400">תקציב מעודכן:</div><div className="font-mono font-bold text-sm">{formatCurrency(f(linkedPayment, config, 'fieldBudgetUpdatedLine'))}</div></div>
                     <div><div className="text-gray-400">נוצל עד היום:</div><div className="font-mono font-bold text-sm">{formatCurrency(f(linkedPayment, config, 'fieldBudgetUtilToday'))}</div></div>
                     <div><div className="text-gray-400">חשבון זה:</div><div className="font-mono font-bold text-sm text-ecogreen-400">{formatCurrency(f(linkedPayment, config, 'fieldBudgetThisAccount'))}</div></div>
                     <div><div className="text-gray-400">יתרה לניצול:</div><div className="font-mono font-bold text-sm">{formatCurrency(f(linkedPayment, config, 'fieldBudgetBalanceUtil'))}</div></div>
                     <div><div className="text-gray-400">אחוז ניצול:</div><div className="font-mono font-bold text-sm">{f(linkedPayment, config, 'fieldBudgetPercentUtil') ? (Number(f(linkedPayment, config, 'fieldBudgetPercentUtil')) * 100).toFixed(1) + '%' : '-'}</div></div>
                   </div>
                 </div>
               </div>
            </aside>

            <main className="flex-1 flex flex-col p-4 gap-4 h-auto md:h-full md:overflow-y-auto order-2 md:order-2">
               <div className="flex flex-col md:flex-row gap-4 h-auto md:h-[600px] shrink-0 md:min-h-[600px]">
                  <div className="flex-1 flex flex-col bg-white border border-gray-200 shadow-sm rounded-2xl overflow-hidden">
                     <div className="h-10 bg-gray-50/80 backdrop-blur-sm border-b border-gray-200 flex items-center justify-between px-4"><span className="font-bold text-gray-700 text-sm flex items-center gap-2">הסכם רלוונטי</span>{contractUrl && <button onClick={() => setModalDoc({ url: contractUrl!, title: 'הסכם רלוונטי' })} className="text-xs text-blue-600 hover:underline hidden md:block">פתח מלא</button>}</div>
                     
                     {/* Mobile Button */}
                     <div className="md:hidden p-4 bg-gray-50 flex justify-center border-b border-gray-100">
                        {contractUrl ? (
                            <button onClick={() => setModalDoc({ url: contractUrl!, title: 'הסכם רלוונטי' })} className="w-full py-2 px-4 bg-white border border-gray-300 text-gray-700 rounded-lg shadow-sm font-bold flex items-center justify-center gap-2">
                                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-5 h-5"><path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 0 0-3.375-3.375h-1.5A1.125 1.125 0 0 1 13.5 7.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 0 0-9-9Z" /></svg>
                                צפה בחוזה מלא (PDF)
                            </button>
                        ) : <span className="text-sm text-gray-400">אין קובץ חוזה</span>}
                     </div>

                     <div className="flex-1 bg-gray-100 relative group flex flex-col">
                        <div className="flex-1 relative hidden md:block">{contractUrl ? <iframe src={contractUrl} className="w-full h-full border-none" title="Contract" /> : <div className="absolute inset-0 flex flex-col items-center justify-center text-gray-400 gap-2"><span className="text-sm">אין קובץ חוזה</span></div>}</div>
                        {/* Contract Details Header Block - Added above milestone content */}
                        {linkedContract && <MilestoneDisplay />}
                        {/* Milestone Content - Visible on Mobile and Desktop */}
                        <MilestoneContent />
                     </div>
                  </div>
                  <div className="flex-1 flex flex-col bg-white border border-gray-200 shadow-sm rounded-2xl overflow-hidden">
                     <div className="h-10 bg-gray-50/80 backdrop-blur-sm border-b border-gray-200 flex items-center justify-between px-4"><span className="font-bold text-gray-700 text-sm flex items-center gap-2">חשבון / דרישה</span>{invoiceUrl && <button onClick={() => setModalDoc({ url: invoiceUrl!, title: 'חשבון עסקה' })} className="text-xs text-blue-600 hover:underline hidden md:block">פתח מלא</button>}</div>
                     
                     {/* Mobile Button */}
                     <div className="md:hidden p-4 bg-gray-50 flex justify-center border-b border-gray-100">
                        {invoiceUrl ? (
                            <button onClick={() => setModalDoc({ url: invoiceUrl!, title: 'חשבון עסקה' })} className="w-full py-2 px-4 bg-white border border-gray-300 text-gray-700 rounded-lg shadow-sm font-bold flex items-center justify-center gap-2">
                                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-5 h-5"><path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 0 0-3.375-3.375h-1.5A1.125 1.125 0 0 1 13.5 7.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 0 0-9-9Z" /></svg>
                                צפה בחשבון (PDF)
                            </button>
                        ) : <span className="text-sm text-gray-400">אין חשבון עסקה</span>}
                     </div>

                     <div className="flex-1 bg-gray-100 relative group hidden md:block">{invoiceUrl ? <iframe src={invoiceUrl} className="w-full h-full border-none" title="Invoice" /> : <div className="absolute inset-0 flex flex-col items-center justify-center text-gray-400 gap-2"><span className="text-sm">אין חשבון עסקה</span></div>}</div>
                  </div>
               </div>
               
               {/* Budget Tables */}
               <div className="space-y-6 pb-10">
                  <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
                     <div className="px-4 py-3 bg-gray-50 border-b border-gray-200 font-bold text-gray-800 text-lg">תשלומים ששולמו / בתהליך (מתוך מערכת)</div>
                     <div className="overflow-x-auto">
                        <table className="w-full text-sm text-right whitespace-nowrap">
                           <thead className="bg-gray-100 text-gray-600 font-medium"><tr><th className="px-3 py-2 border-b">סטטוס</th><th className="px-3 py-2 border-b">מקור תשלום</th><th className="px-3 py-2 border-b">סה"כ לתשלום</th><th className="px-3 py-2 border-b">החזר הוצ' (ללא מע"מ)</th><th className="px-3 py-2 border-b">החזר הוצ' (מע"מ)</th><th className="px-3 py-2 border-b">הצמדה</th><th className="px-3 py-2 border-b font-bold">סכום לפני מע"מ והצמדה</th><th className="px-3 py-2 border-b w-1/3">תיאור התשלום</th><th className="px-3 py-2 border-b">מס' הוראה</th></tr></thead>
                           <tbody className="divide-y divide-gray-100">
                              {relatedPayments.length === 0 ? (<tr><td colSpan={9} className="px-3 py-4 text-center text-gray-400">לא נמצאו תשלומים נוספים</td></tr>) : (relatedPayments.map((p) => {
                                  const isCurrent = p.id === linkedPayment?.id;
                                  return (
                                    <tr key={p.id} className={isCurrent ? "bg-yellow-50 font-bold" : "hover:bg-gray-50"}>
                                       <td className="px-3 py-2">{isCurrent ? 'תשלום נוכחי' : s(p.fields['סטטוס'])}</td>
                                       <td className="px-3 py-2">{s(f(p, config, 'fieldBudgetPaymentSource'))}</td>
                                       <td className="px-3 py-2">{formatCurrency(f(p, config, 'fieldBudgetTotalToPay'))}</td>
                                       <td className="px-3 py-2">{formatCurrency(f(p, config, 'fieldBudgetRefundNonVat'))}</td>
                                       <td className="px-3 py-2">{formatCurrency(f(p, config, 'fieldBudgetRefundVat'))}</td>
                                       <td className="px-3 py-2">{formatCurrency(f(p, config, 'fieldBudgetLinkage'))}</td>
                                       <td className="px-3 py-2 font-bold">{formatCurrency(f(p, config, 'fieldBudgetSumBeforeVat'))}</td>
                                       <td className="px-3 py-2 truncate max-w-xs" title={s(f(p, config, 'fieldBudgetPaymentDesc'))}>{s(f(p, config, 'fieldBudgetPaymentDesc'))}</td>
                                       <td className="px-3 py-2">{s(f(p, config, 'fieldBudgetPaymentOrder'))}</td>
                                    </tr>
                                  );
                                }))}
                              {relatedPayments.length > 0 && (<tr className="bg-gray-50 font-bold"><td colSpan={6} className="px-3 py-2 text-left">סה"כ:</td><td className="px-3 py-2 border-t border-gray-300">{formatCurrency(relatedPayments.reduce((acc, curr) => acc + (parseFloat(String(f(curr, config, 'fieldBudgetSumBeforeVat')).replace(/[^0-9.-]+/g,"")) || 0), 0))}</td><td colSpan={2}></td></tr>)}
                           </tbody>
                        </table>
                     </div>
                  </div>

                  <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
                     <div className="px-4 py-3 bg-gray-50 border-b border-gray-200 font-bold text-gray-800 text-lg">הסכמים לספק בפרויקט (מתוך מערכת)</div>
                     <div className="overflow-x-auto">
                        <table className="w-full text-sm text-right whitespace-nowrap">
                           <thead className="bg-gray-100 text-gray-600 font-medium"><tr><th className="px-3 py-2 border-b">יתרה לתשלום</th><th className="px-3 py-2 border-b">בתהליך</th><th className="px-3 py-2 border-b">שולם</th><th className="px-3 py-2 border-b">סכום</th><th className="px-3 py-2 border-b">הצמדה</th><th className="px-3 py-2 border-b w-1/3">תיאור</th><th className="px-3 py-2 border-b">תאריך</th></tr></thead>
                           <tbody className="divide-y divide-gray-100">
                             {linkedContract ? (
                               <tr>
                                  <td className="px-3 py-2 font-bold text-black">{formatCurrency(contractBalance)}</td>
                                  <td className="px-3 py-2">{s(f(linkedContract, config, 'fieldContractInProcess')) || '-'}</td>
                                  <td className="px-3 py-2">{formatCurrency(f(linkedContract, config, 'fieldContractPaid'))}</td>
                                  <td className="px-3 py-2 font-bold">{formatCurrency(f(linkedContract, config, 'fieldContractSum'))}</td>
                                  <td className="px-3 py-2">{s(f(linkedContract, config, 'fieldContractLinkage')) || '-'}</td>
                                  <td className="px-3 py-2 truncate max-w-xs">{s(f(linkedContract, config, 'fieldContractDesc'))}</td>
                                  <td className="px-3 py-2">{formatDate(s(f(linkedContract, config, 'fieldContractDate')))}</td>
                               </tr>
                             ) : (<tr><td colSpan={7} className="px-3 py-4 text-center text-gray-400">לא נמצא חוזה מקושר</td></tr>)}
                           </tbody>
                        </table>
                     </div>
                  </div>
               </div>
            </main>
          </div>
          {modalDoc && <DocumentModal url={modalDoc.url} title={modalDoc.title} onClose={() => setModalDoc(null)} />}
        </div>
      </BackgroundContainer>
    );
  }

  // --- LIST VIEW ---
  return (
    <BackgroundContainer>
      <div className="flex flex-col h-screen overflow-hidden">
        {/* Increased header height to h-24 for larger logo room */}
        <header className="bg-white border-b border-gray-200 h-24 flex items-center justify-between px-4 md:px-6 flex-shrink-0 z-20 shadow-sm"><div className="flex items-center gap-3"><Logo /></div><div className="flex items-center gap-3 md:gap-4"><div className="text-right hidden sm:block"><div className="text-[10px] text-gray-400 font-bold uppercase tracking-wider">מחובר כ-</div><div className="text-sm font-bold text-gray-700">{user?.name}</div></div><button onClick={handleRefresh} disabled={loading} className="p-2 text-gray-400 hover:text-ecogreen-600 hover:bg-ecogreen-50 rounded-full transition-all" title="רענן נתונים"><svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className={`w-5 h-5 ${loading ? 'animate-spin' : ''}`}><path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.992 0 3.181 3.183a8.25 8.25 0 0 0 13.803-3.7M4.031 9.865a8.25 8.25 0 0 1 13.803-3.7l3.181 3.182m0-4.991v4.99" /></svg></button><button onClick={handleLogout} className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-full transition-all" title="התנתק"><svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-5 h-5"><path strokeLinecap="round" strokeLinejoin="round" d="M15.75 9V5.25A2.25 2.25 0 0 0 13.5 3h-6a2.25 2.25 0 0 0-2.25 2.25v13.5A2.25 2.25 0 0 0 7.5 21h6a2.25 2.25 0 0 0 2.25-2.25V15m3 0 3-3m0 0-3-3m3 3H9" /></svg></button></div></header>
        <div className="bg-white border-b border-gray-200 p-4 shadow-sm z-10 flex flex-col md:flex-row items-center justify-between gap-4">
           {/* Filters Container with padding and center alignment */}
           <div className="flex gap-3 w-full md:w-auto overflow-x-auto no-scrollbar order-1 md:order-1 px-4 py-1 justify-center md:justify-start items-center">
               <SearchableSelect options={uniqueProjects} value={projectFilter} onChange={setProjectFilter} placeholder="כל הפרויקטים" icon={<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4"><path fillRule="evenodd" d="M2.24 6.8a.75.75 0 0 0 1.06-.04l1.95-2.1 1.95 2.1a.75.75 0 1 0 1.1-1.02l-2.5-2.7a.75.75 0 0 0-1.1 0l-2.5 2.7a.75.75 0 0 0 .04 1.06Zm6.11 5.5a.75.75 0 0 0 1.06-.04l1.95-2.1 1.95 2.1a.75.75 0 1 0 1.1-1.02l-2.5-2.7a.75.75 0 0 0-1.1 0l-2.5 2.7a.75.75 0 0 0 .04 1.06Zm6.11 5.5a.75.75 0 0 0 1.06-.04l1.95-2.1 1.95 2.1a.75.75 0 1 0 1.1-1.02l-2.5-2.7a.75.75 0 0 0-1.1 0l-2.5 2.7a.75.75 0 0 0 .04 1.06Z" clipRule="evenodd" /></svg>} />
               <SearchableSelect options={uniqueSuppliers} value={supplierFilter} onChange={setSupplierFilter} placeholder="כל הספקים" icon={<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4"><path d="M10 9a3 3 0 1 0 0-6 3 3 0 0 0 0 6ZM6 8a2 2 0 1 1-4 0 2 2 0 0 1 4 0ZM1.49 15.326a.78.78 0 0 1-.358-.442 3 3 0 0 1 4.308-3.516 6.484 6.484 0 0 0-1.905 3.959c-.023.222-.014.442.025.654a4.97 4.97 0 0 1-2.07-.655ZM16.44 15.98a4.97 4.97 0 0 0 2.07-.654.78.78 0 0 0 .358-.442 3 3 0 0 0-4.308-3.517 6.484 6.484 0 0 1 1.905 3.96 6.765 6.765 0 0 1-.025.654Zm-4.57-2.23a4.994 4.994 0 0 1 0 8.374 5.051 5.051 0 0 0 0-8.374Zm2.597 3.84a2 2 0 1 1-4 0 2 2 0 0 1 4 0Z" /></svg>} />
               
               {/* View Toggle */}
               <div className="flex bg-gray-100 p-1 rounded-lg border border-gray-200 gap-1 mr-2">
                   <button onClick={() => setListMode('CARDS')} className={`p-1.5 rounded-md transition-all ${listMode === 'CARDS' ? 'bg-white shadow-sm text-ecogreen-600' : 'text-gray-400 hover:text-gray-600'}`} title="תצוגת כרטיסים">
                       <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-5 h-5"><path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6A2.25 2.25 0 0 1 6 3.75h2.25A2.25 2.25 0 0 1 10.5 6v2.25a2.25 2.25 0 0 1-2.25 2.25H6a2.25 2.25 0 0 1-2.25-2.25V6ZM3.75 15.75A2.25 2.25 0 0 1 6 13.5h2.25a2.25 2.25 0 0 1 2.25 2.25V18a2.25 2.25 0 0 1-2.25 2.25H6A2.25 2.25 0 0 1 3.75 18v-2.25ZM13.5 6a2.25 2.25 0 0 1 2.25-2.25H18A2.25 2.25 0 0 1 20.25 6v2.25A2.25 2.25 0 0 1 18 10.5h-2.25a2.25 2.25 0 0 1-2.25-2.25V6ZM13.5 15.75a2.25 2.25 0 0 1 2.25-2.25H18a2.25 2.25 0 0 1 2.25 2.25V18A2.25 2.25 0 0 1 18 20.25h-2.25A2.25 2.25 0 0 1 13.5 18v-2.25Z" /></svg>
                   </button>
                   <button onClick={() => setListMode('TABLE')} className={`p-1.5 rounded-md transition-all ${listMode === 'TABLE' ? 'bg-white shadow-sm text-ecogreen-600' : 'text-gray-400 hover:text-gray-600'}`} title="תצוגת רשימה">
                       <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-5 h-5"><path strokeLinecap="round" strokeLinejoin="round" d="M3.75 12h16.5m-16.5 3.75h16.5M3.75 19.5h16.5M5.625 4.5h12.75a1.875 1.875 0 0 1 0 3.75H5.625a1.875 1.875 0 0 1 0-3.75Z" /></svg>
                   </button>
               </div>
           </div>
           
           <div className="flex gap-2 w-full md:w-auto self-end md:self-center order-2 md:order-2 overflow-x-auto no-scrollbar">
               <button onClick={() => setFilter('WAITING')} className={`h-10 px-4 rounded-full font-bold text-sm whitespace-nowrap shadow-sm transition-all flex items-center gap-2 ${filter === 'WAITING' ? 'bg-yellow-400 text-yellow-950 ring-2 ring-yellow-200 ring-offset-2' : 'bg-white text-gray-600 border border-gray-200 hover:bg-gray-50'}`}><div className={`w-2 h-2 rounded-full ${filter === 'WAITING' ? 'bg-white' : 'bg-yellow-500'}`} />ממתינים ({waitingCount})</button>
               <button onClick={() => setFilter('DELAYED')} className={`h-10 px-4 rounded-full font-bold text-sm whitespace-nowrap shadow-sm transition-all flex items-center gap-2 ${filter === 'DELAYED' ? 'bg-orange-600 text-white ring-2 ring-orange-200 ring-offset-2' : 'bg-white text-gray-600 border border-gray-200 hover:bg-gray-50'}`}><div className={`w-2 h-2 rounded-full ${filter === 'DELAYED' ? 'bg-white' : 'bg-orange-600'}`} />עוכבו ({delayedCount})</button>
               <button onClick={() => setFilter('REJECTED')} className={`h-10 px-4 rounded-full font-bold text-sm whitespace-nowrap shadow-sm transition-all flex items-center gap-2 ${filter === 'REJECTED' ? 'bg-red-600 text-white ring-2 ring-red-200 ring-offset-2' : 'bg-white text-gray-600 border border-gray-200 hover:bg-gray-50'}`}><div className={`w-2 h-2 rounded-full ${filter === 'REJECTED' ? 'bg-white' : 'bg-red-600'}`} />נדחו ({rejectedCount})</button>
           </div>
        </div>
        
        {/* Main List Content */}
        <div className="flex-1 overflow-y-auto p-3 md:p-4 bg-gray-50/50">
           {selectedIds.size > 0 && (
               <div className="fixed bottom-6 left-1/2 transform -translate-x-1/2 z-50 animate-in slide-in-from-bottom-4 fade-in w-[95%] max-w-2xl">
                   <div className="bg-gray-900/90 backdrop-blur-md text-white p-2 rounded-2xl shadow-2xl flex items-center justify-between pl-2 pr-4 border border-gray-700/50">
                       <div className="font-bold text-sm flex items-center gap-2">
                           <span className="bg-white text-gray-900 px-2 py-0.5 rounded-md text-xs font-black">{selectedIds.size}</span>
                           <span className="hidden sm:inline">נבחרו</span>
                       </div>
                       <div className="flex gap-2">
                           <button onClick={() => handleBulkClick('TRANSFER')} className="p-2 hover:bg-white/10 rounded-lg text-sky-300 hover:text-sky-200 transition-colors flex flex-col items-center gap-0.5" title="העבר">
                               <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-5 h-5"><path strokeLinecap="round" strokeLinejoin="round" d="M7.5 21 3 16.5m0 0L7.5 12M3 16.5h13.5m0-13.5L21 7.5m0 0L16.5 12M21 7.5H7.5" /></svg>
                               <span className="text-[10px] font-medium">העבר</span>
                           </button>
                           <button onClick={() => handleBulkClick('DELAY')} className="p-2 hover:bg-white/10 rounded-lg text-orange-300 hover:text-orange-200 transition-colors flex flex-col items-center gap-0.5" title="עכב">
                               <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-5 h-5"><path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" /></svg>
                               <span className="text-[10px] font-medium">עכב</span>
                           </button>
                           <button onClick={() => handleBulkClick('REJECT')} className="p-2 hover:bg-white/10 rounded-lg text-red-300 hover:text-red-200 transition-colors flex flex-col items-center gap-0.5" title="דחה">
                               <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-5 h-5"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" /></svg>
                               <span className="text-[10px] font-medium">דחה</span>
                           </button>
                           <div className="w-px bg-gray-700 mx-1"></div>
                           <button onClick={() => handleBulkClick('APPROVE')} className="bg-ecogreen-600 hover:bg-ecogreen-500 text-white px-4 py-1.5 rounded-xl font-bold shadow-lg transition-all flex items-center gap-2">
                               <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor" className="w-5 h-5"><path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" /></svg>
                               <span>אשר הכל</span>
                           </button>
                       </div>
                   </div>
               </div>
           )}
           {renderBulkModal()}

           <div className={`mx-auto ${listMode === 'CARDS' ? 'max-w-6xl grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6' : 'max-w-7xl'}`}>
              {filteredApprovals.length === 0 ? (
                 <div className="text-center py-20 col-span-full"><div className="bg-white w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4 shadow-sm"><svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-8 h-8 text-gray-300"><path strokeLinecap="round" strokeLinejoin="round" d="M9 12h3.75M9 15h3.75M9 18h3.75m3 .75H18a2.25 2.25 0 0 0 2.25-2.25V6.108c0-1.135-.845-2.098-1.976-2.192a48.424 48.424 0 0 0-1.123-.08m-5.801 0c-.065.21-.1.433-.1.664 0 .414.336.75.75.75h4.5a.75.75 0 0 0 .75-.75 2.25 2.25 0 0 0-.1-.664m-5.8 0A2.251 2.251 0 0 1 13.5 2.25H15c1.012 0 1.867.668 2.15 1.586m-5.8 0c-.376.023-.75.05-1.124.08C9.095 4.01 8.25 4.973 8.25 6.108V8.25m0 0H4.875c-.621 0-1.125.504-1.125 1.125v11.25c0 .621.504 1.125 1.125 1.125h9.75c.621 0 1.125-.504 1.125-1.125V9.375c0-.621-.504-1.125-1.125-1.125H8.25ZM6.75 12h.008v.008H6.75V12Zm0 3h.008v.008H6.75V15Zm0 3h.008v.008H6.75V18Z" /></svg></div>
                 <p className="text-gray-500 font-medium">
                    {filter === 'WAITING' ? 'אין אישורים ממתינים לחתימתך' : 
                     filter === 'DELAYED' ? 'אין אישורים מעוכבים' :
                     filter === 'REJECTED' ? 'אין אישורים שנדחו' : 
                     'אין נתונים להצגה'}
                 </p>
                 </div>
              ) : listMode === 'CARDS' ? (
                 // --- CARD VIEW ---
                 filteredApprovals.map(approval => {
                    const status = approval.fields[config.fieldApprovalStatus];
                    const isWaiting = status === 'ממתין' || status === config.statusWaitingValue;
                    const isRejected = status === config.statusRejectedValue || status === 'דחה';
                    const isApproved = status === config.statusSignedValue || status === 'אושר';
                    const isDelayed = status === config.statusDelayedValue || status === 'עכב' || status === 'עיקוב' || status === 'עיכוב';
                    let statusBadgeColor = 'bg-gray-100 text-gray-500';
                    let sideBorderColor = 'border-gray-200';
                    let statusText = status || 'לא ידוע';
                    if (isWaiting) { statusBadgeColor = 'bg-yellow-100 text-yellow-800 border border-yellow-200'; sideBorderColor = 'border-yellow-400'; statusText = 'ממתין לאישור'; }
                    if (isRejected) { statusBadgeColor = 'bg-red-100 text-red-700 border border-red-200'; sideBorderColor = 'border-red-500'; }
                    if (isApproved) { statusBadgeColor = 'bg-green-100 text-green-700 border border-ecogreen-200'; sideBorderColor = 'border-ecogreen-500'; }
                    if (isDelayed) { statusBadgeColor = 'bg-orange-100 text-orange-700 border border-orange-200'; sideBorderColor = 'border-orange-500'; statusText = 'בעיכוב'; }
                    const paymentAmount = f(approval, config, 'fieldApprovalPaymentAmount');
                    const serialNumber = s(f(approval, config, 'fieldApprovalSerial'));
                    const rejectionReason = s(f(approval, config, 'fieldRejectionReason'));
                    const delayReason = s(f(approval, config, 'fieldDelayReason'));
                    
                    const paymentId = s(approval.fields[config.fieldPaymentLink]);
                    const paymentRec = paymentsMap[paymentId];
                    const description = s(f(approval, config, 'fieldApprovalDescription')) || s(f(paymentRec, config, 'fieldPaymentDescription')) || 'הוראת תשלום';

                    const contractId = s(f(approval, config, 'fieldApprovalContractLink'));
                    const contractRec = contractsMap[contractId];
                    const contractDate = contractRec ? formatDate(s(f(contractRec, config, 'fieldContractDate'))) : null;
                    const contractTitle = contractRec ? s(f(contractRec, config, 'fieldContractDesc')) : null;
                    const contractSum = contractRec ? formatCurrency(f(contractRec, config, 'fieldContractSum')) : null;
                    
                    const rawMilestoneNum = approval.fields['אבן דרך מספר'] || f(approval, config, 'fieldMilestoneNumber');
                    const milestoneNum = s(rawMilestoneNum);
                    const contractSec = s(f(approval, config, 'fieldMilestoneSection'));

                    const relatedApprovals = approvalsMap[paymentId] || [];
                    const sortedRelated = [...relatedApprovals].sort((a, b) => {
                       const valA = a.fields[config.fieldApprovalOrder];
                       const valB = b.fields[config.fieldApprovalOrder];
                       const numA = extractOrderNumber(valA);
                       const numB = extractOrderNumber(valB);
                       return numA - numB;
                    });

                    return (
                       <div key={approval.id} onClick={() => handleApprovalClick(approval)} className={`bg-white rounded-2xl shadow-md hover:shadow-xl hover:border-ecogreen-300 transition-all cursor-pointer relative group border border-gray-100 border-r-4 min-h-[450px] flex flex-col justify-between p-6 ${sideBorderColor}`} dir="rtl">
                             {sortedRelated.length > 0 && (
                               <div className="w-full flex justify-center items-center gap-3 flex-wrap mb-4">
                                  {sortedRelated.map((relApp, rIdx) => {
                                      const relStatus = relApp.fields[config.fieldApprovalStatus];
                                      const relWaiting = relStatus === config.statusWaitingValue || relStatus === 'ממתין' || relStatus === 'ממתין לאישור';
                                      const relApproved = relStatus === config.statusSignedValue || relStatus === 'אושר';
                                      const relRejected = relStatus === config.statusRejectedValue || relStatus === 'נדחה' || relStatus === 'דחה';
                                      const relDelayed = relStatus === config.statusDelayedValue || relStatus === 'עיקוב' || relStatus === 'עיכוב' || relStatus === 'עכב';
                                      const isCurrentMe = relApp.id === approval.id;

                                      let name = '';
                                      if (config.fieldApprovalEmployeeNameLookup) {
                                          name = s(relApp.fields[config.fieldApprovalEmployeeNameLookup]);
                                      }
                                      if (!name) {
                                          const rawVal = f(relApp, config, 'fieldApprovalEmployee');
                                          if (typeof rawVal === 'object' && rawVal !== null && !Array.isArray(rawVal) && rawVal.name) name = rawVal.name;
                                          else if (Array.isArray(rawVal) && rawVal.length > 0 && rawVal[0].name) name = rawVal[0].name;
                                          else name = 'עובד';
                                      }

                                      let pillClass = '';
                                      if (relApproved) {
                                          pillClass = "bg-ecogreen-100 border border-ecogreen-200 text-ecogreen-700";
                                      } else if (relWaiting || isCurrentMe) {
                                          pillClass = "bg-yellow-50 border-2 border-yellow-400 text-yellow-900 font-bold shadow-sm ring-1 ring-yellow-100";
                                      } else if (relRejected) {
                                          pillClass = "bg-red-100 border border-red-300 text-red-900 font-bold";
                                      } else if (relDelayed) {
                                          pillClass = "bg-orange-100 border border-orange-300 text-orange-900 font-bold";
                                      } else {
                                          pillClass = "bg-gray-50 border border-gray-100 text-gray-400";
                                      }

                                      return (
                                          <div key={relApp.id} className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs whitespace-nowrap transition-all ${pillClass}`}>
                                              <span className="text-[10px] opacity-70 font-bold">#{rIdx + 1}</span>
                                              <span className="truncate max-w-[80px]" title={name}>{name}</span>
                                          </div>
                                      );
                                  })}
                               </div>
                             )}

                             <div className="flex justify-between items-start mb-2">
                                <div className="flex flex-col"><span className="text-sm text-gray-900 font-bold tracking-wide">{formatDate(approval.createdTime)}</span>{serialNumber && (<span className="text-xs text-black font-bold mt-1">מספר רץ: {serialNumber}</span>)}</div>
                                <div className="flex flex-col items-end gap-1"><span className={`px-2.5 py-1 rounded-md text-[10px] font-bold tracking-wide shadow-sm ${statusBadgeColor}`}>{statusText}</span></div>
                             </div>
                             
                             <div className="text-center flex-1 flex flex-col justify-center gap-3">
                                <h3 className="text-gray-900 font-bold text-xl leading-tight transition-colors line-clamp-2">{description}</h3>
                                <div className="text-4xl font-black text-gray-900 tracking-tight" dir="ltr">{formatCurrency(paymentAmount)}</div>
                                
                                {contractRec && (
                                    <div className="bg-gray-50 border border-gray-200 rounded-xl p-3 text-xs text-gray-600 grid grid-cols-2 gap-x-3 gap-y-2 text-right shadow-inner">
                                        {contractTitle && <div className="col-span-2 font-bold text-gray-800 text-sm truncate" title={contractTitle}>{contractTitle}</div>}
                                        {contractDate && <div className="flex justify-between"><span className="text-gray-400">תאריך:</span> <span className="font-medium text-gray-800">{contractDate}</span></div>}
                                        {contractSum && <div className="flex justify-between"><span className="text-gray-400">סכום:</span> <span className="font-medium text-gray-800">{contractSum}</span></div>}
                                        {(milestoneNum || contractSec) && (
                                            <div className="col-span-2 border-t border-gray-200 pt-2 mt-1 flex flex-wrap gap-4 text-xs justify-center bg-white rounded-lg py-1">
                                                {milestoneNum && <div className="text-amber-700 font-bold flex gap-1 items-center"><span className="text-gray-400 font-normal">אבן דרך:</span> {milestoneNum}</div>}
                                                {contractSec && <div className="text-gray-700 font-bold flex gap-1 items-center"><span className="text-gray-400 font-normal">סעיף:</span> {contractSec}</div>}
                                            </div>
                                        )}
                                    </div>
                                )}
                             </div>

                             {(isRejected && rejectionReason) && (
                                <div className="mt-4 bg-red-50 p-3 rounded-xl border border-red-100 text-right shadow-sm">
                                    <p className="text-[10px] text-red-500 font-bold uppercase mb-1 flex items-center gap-1"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-3 h-3"><path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" /></svg> סיבת דחייה</p>
                                    <p className="text-xs text-red-800 leading-snug line-clamp-3 font-medium" title={rejectionReason}>{rejectionReason}</p>
                                </div>
                             )}
                             {(isDelayed && delayReason) && (
                                <div className="mt-4 bg-orange-50 p-3 rounded-xl border border-orange-100 text-right shadow-sm">
                                    <p className="text-[10px] text-orange-500 font-bold uppercase mb-1 flex items-center gap-1"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-3 h-3"><path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" /></svg> סיבת עיכוב</p>
                                    <p className="text-xs text-orange-800 leading-snug line-clamp-3 font-medium" title={delayReason}>{delayReason}</p>
                                </div>
                             )}

                             <div className="pt-4 mt-4 border-t border-gray-100 grid grid-cols-2 gap-4">
                                <div className="flex flex-col text-right">
                                   <span className="text-[10px] text-gray-400 font-bold uppercase mb-0.5">פרויקט</span>
                                   <span className="truncate font-bold text-gray-800 text-sm" title={s(f(approval, config, 'fieldApprovalProject'))}>{s(f(approval, config, 'fieldApprovalProject'))}</span>
                                </div>
                                <div className="flex flex-col text-left ltr">
                                   <span className="text-[10px] text-gray-400 font-bold uppercase mb-0.5 text-right dir-rtl">ספק</span>
                                   <span className="truncate font-bold text-gray-800 text-sm text-right" dir="rtl" title={s(f(approval, config, 'fieldApprovalSupplier'))}>{s(f(approval, config, 'fieldApprovalSupplier'))}</span>
                                </div>
                             </div>
                       </div>
                    );
                 })
              ) : (
                  // --- TABLE VIEW ---
                  <div className="col-span-full bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
                      <div className="overflow-x-auto">
                        <table className="w-full text-sm text-right whitespace-nowrap">
                            <thead className="bg-gray-50 text-gray-600 font-medium border-b border-gray-200">
                                <tr>
                                    <th className="px-4 py-3 w-10 text-center">
                                        <input 
                                            type="checkbox" 
                                            className="w-4 h-4 text-ecogreen-600 rounded border-gray-300 focus:ring-ecogreen-500 cursor-pointer"
                                            checked={filteredApprovals.length > 0 && selectedIds.size === filteredApprovals.length}
                                            onChange={handleSelectAll}
                                        />
                                    </th>
                                    <th className="px-4 py-3">תאריך</th>
                                    <th className="px-4 py-3">פרויקט</th>
                                    <th className="px-4 py-3">ספק</th>
                                    <th className="px-4 py-3 w-1/4">תיאור</th>
                                    <th className="px-4 py-3 text-left">סכום</th>
                                    <th className="px-4 py-3">סטטוס</th>
                                    <th className="px-4 py-3">פעולות</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-100">
                                {filteredApprovals.map((approval) => {
                                    const paymentAmount = f(approval, config, 'fieldApprovalPaymentAmount');
                                    const description = s(f(approval, config, 'fieldApprovalDescription')) || 'הוראת תשלום';
                                    const status = approval.fields[config.fieldApprovalStatus] || 'לא ידוע';
                                    const isWaiting = status === 'ממתין' || status === config.statusWaitingValue;
                                    let statusColor = 'text-gray-600 bg-gray-100';
                                    if (isWaiting) statusColor = 'text-yellow-700 bg-yellow-50';
                                    else if (status === config.statusSignedValue || status === 'אושר') statusColor = 'text-green-700 bg-green-50';
                                    else if (status === config.statusRejectedValue || status === 'נדחה') statusColor = 'text-red-700 bg-red-50';
                                    else if (status === config.statusDelayedValue || status === 'עיכוב' || status === 'עיקוב') statusColor = 'text-orange-700 bg-orange-50';

                                    return (
                                        <tr key={approval.id} className={`hover:bg-gray-50 transition-colors ${selectedIds.has(approval.id) ? 'bg-ecogreen-50/50' : ''}`}>
                                            <td className="px-4 py-3 text-center">
                                                <input 
                                                    type="checkbox" 
                                                    className="w-4 h-4 text-ecogreen-600 rounded border-gray-300 focus:ring-ecogreen-500 cursor-pointer"
                                                    checked={selectedIds.has(approval.id)}
                                                    onChange={(e) => { e.stopPropagation(); handleSelectRow(approval.id); }}
                                                />
                                            </td>
                                            <td className="px-4 py-3 text-gray-500">{formatDate(approval.createdTime)}</td>
                                            <td className="px-4 py-3 font-medium text-gray-900 truncate max-w-[150px]" title={s(f(approval, config, 'fieldApprovalProject'))}>{s(f(approval, config, 'fieldApprovalProject'))}</td>
                                            <td className="px-4 py-3 truncate max-w-[150px]" title={s(f(approval, config, 'fieldApprovalSupplier'))}>{s(f(approval, config, 'fieldApprovalSupplier'))}</td>
                                            <td className="px-4 py-3 truncate max-w-xs text-gray-600" title={description}>{description}</td>
                                            <td className="px-4 py-3 font-bold text-gray-900 text-left" dir="ltr">{formatCurrency(paymentAmount)}</td>
                                            <td className="px-4 py-3"><span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${statusColor}`}>{status}</span></td>
                                            <td className="px-4 py-3">
                                                <button onClick={() => handleApprovalClick(approval)} className="text-ecogreen-600 hover:text-ecogreen-700 font-medium text-xs border border-ecogreen-200 hover:bg-ecogreen-50 px-2 py-1 rounded transition-colors">
                                                    פרטים
                                                </button>
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                      </div>
                  </div>
              )}
           </div>
        </div>
      </div>
    </BackgroundContainer>
  );
}

export default App;
