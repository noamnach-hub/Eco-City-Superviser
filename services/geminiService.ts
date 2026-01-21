import { GoogleGenAI } from "@google/genai";
import { AirtableRecord } from "../types";

export const summarizeRecord = async (record: AirtableRecord): Promise<string> => {
  const apiKey = process.env.API_KEY;
  if (!apiKey) {
    console.warn("Gemini API Key not found in process.env.API_KEY");
    return "מפתח Gemini API לא הוגדר.";
  }

  const ai = new GoogleGenAI({ apiKey });
  
  // Convert record fields to a string for context
  const recordContext = JSON.stringify(record.fields, null, 2);

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: `You are an accounting assistant for Ecocity real estate in Israel. 
      Analyze the following accounting record data and provide a brief, professional summary in Hebrew (max 2 sentences) explaining what this expense/line item appears to be for, to help the employee decide if they should sign it.
      
      Record Data:
      ${recordContext}`
    });

    return response.text || "לא ניתן היה ליצור סיכום.";
  } catch (error) {
    console.error("Gemini Error:", error);
    return "שגיאה ביצירת סיכום.";
  }
};
