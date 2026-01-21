
import React, { useState } from 'react';
import { AppConfig } from '../types';
import { fetchTableFields } from '../services/airtableService';

interface ConfigModalProps {
  config: AppConfig;
  onSave: (config: AppConfig) => void;
  isOpen: boolean;
}

const ConfigModal: React.FC<ConfigModalProps> = ({ config, onSave, isOpen }) => {
  const [localConfig, setLocalConfig] = useState<AppConfig>(config);
  const [availableFields, setAvailableFields] = useState<string[]>([]);
  const [loadingFields, setLoadingFields] = useState(false);
  const [fieldError, setFieldError] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleChange = (key: keyof AppConfig, value: string) => {
    setLocalConfig(prev => ({ ...prev, [key]: value }));
  };

  const loadFields = async () => {
    setLoadingFields(true);
    setFieldError(null);
    try {
      const fields = await fetchTableFields(localConfig);
      if (fields.length > 0) {
        setAvailableFields(fields);
      } else {
        setFieldError("No records found to extract fields from, or API key invalid.");
      }
    } catch (e) {
      setFieldError("Failed to fetch fields.");
    } finally {
      setLoadingFields(false);
    }
  };

  const renderFieldInput = (label: string, configKey: keyof AppConfig) => {
    return (
      <div>
        <label className="block text-xs text-gray-500 mb-1">{label}</label>
        {availableFields.length > 0 ? (
          <select 
            value={localConfig[configKey] as string}
            onChange={e => handleChange(configKey, e.target.value)}
            className="w-full px-2 py-1 text-sm border rounded bg-white"
          >
            <option value="">Select Field...</option>
            {availableFields.map(f => (
              <option key={f} value={f}>{f}</option>
            ))}
             {/* Keep current value if not in list */}
            {!availableFields.includes(localConfig[configKey] as string) && localConfig[configKey] && (
               <option value={localConfig[configKey] as string}>{localConfig[configKey] as string}</option>
            )}
          </select>
        ) : (
          <input 
            type="text" 
            value={localConfig[configKey] as string} 
            onChange={e => handleChange(configKey, e.target.value)} 
            className="w-full px-2 py-1 text-sm border rounded" 
          />
        )}
      </div>
    );
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50 p-4">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
        <div className="p-6">
          <h2 className="text-2xl font-bold text-gray-800 mb-4">Application Setup</h2>
          <p className="text-sm text-gray-600 mb-6">
            Configure your Airtable connection and field mappings.
          </p>

          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Airtable Personal Access Token</label>
              <input
                type="password"
                value={localConfig.apiKey}
                onChange={(e) => handleChange('apiKey', e.target.value)}
                className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-ecogreen-500 outline-none"
                placeholder="pat..."
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Base ID</label>
                <input
                  type="text"
                  value={localConfig.baseId}
                  onChange={(e) => handleChange('baseId', e.target.value)}
                  className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-ecogreen-500 outline-none"
                  placeholder="app..."
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Approvals Table ID</label>
                <input
                  type="text"
                  value={localConfig.approvalsTableId}
                  onChange={(e) => handleChange('approvalsTableId', e.target.value)}
                  className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-ecogreen-500 outline-none"
                  placeholder="tbl..."
                />
              </div>
            </div>

            <div className="border-t pt-4 mt-4">
               <div className="flex justify-between items-center mb-2">
                 <h3 className="text-sm font-semibold text-gray-900">Field Mapping</h3>
                 <button 
                   onClick={loadFields} 
                   disabled={loadingFields}
                   className="text-xs bg-gray-100 hover:bg-gray-200 text-gray-700 px-2 py-1 rounded border"
                 >
                   {loadingFields ? 'Loading...' : 'Load Fields from Table'}
                 </button>
               </div>
               
               {fieldError && <p className="text-xs text-red-500 mb-2">{fieldError}</p>}
               {availableFields.length > 0 && <p className="text-xs text-green-600 mb-2">Fields loaded! Select from dropdowns below.</p>}

               <div className="grid grid-cols-2 gap-3">
                 {renderFieldInput("Employee Field Name", "fieldApprovalEmployee")}
                 {renderFieldInput("Status Field Name", "fieldApprovalStatus")}
                 {renderFieldInput("Payment Amount Field", "fieldPaymentAmount")}
                 {renderFieldInput("Milestone Section Field", "fieldMilestoneSection")}
                 {renderFieldInput("Milestone Number Field", "fieldMilestoneNumber")}
                 
                 <div>
                    <label className="block text-xs text-gray-500 mb-1">Status 'Waiting' Value</label>
                    <input type="text" value={localConfig.statusWaitingValue} onChange={e => handleChange('statusWaitingValue', e.target.value)} className="w-full px-2 py-1 text-sm border rounded" />
                 </div>
                 <div>
                    <label className="block text-xs text-gray-500 mb-1">Status 'Signed' Value</label>
                    <input type="text" value={localConfig.statusSignedValue} onChange={e => handleChange('statusSignedValue', e.target.value)} className="w-full px-2 py-1 text-sm border rounded" />
                 </div>
                 
                 {renderFieldInput("Signature Attachment Field", "fieldSignature")}
               </div>
            </div>
            
          </div>

          <div className="mt-8">
            <button
              onClick={() => onSave(localConfig)}
              className="w-full bg-ecogreen-600 text-white py-3 rounded-xl font-bold hover:bg-ecogreen-700 transition-all shadow-lg hover:shadow-xl"
            >
              Connect to Ecocity
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ConfigModal;
