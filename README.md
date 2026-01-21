<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://github.com/user-attachments/assets/0aa67016-6eaf-458a-adb2-6e31a0763ed6" />
</div>

# Eco City Supervisor App

An approval workflow application for Eco City real estate, built with React and Vite. Connects to Airtable for data management.

## Run Locally

**Prerequisites:** Node.js (v18+)

### Setup

1. **Clone the repository:**
   ```bash
   git clone https://github.com/noamnach-hub/Eco-City-Superviser.git
   cd Eco-City-Superviser
   ```

2. **Install dependencies:**
   ```bash
   npm install
   ```

3. **Configure environment variables:**
   ```bash
   cp .env.example .env.local
   ```
   Then edit `.env.local` and add your API keys:
   - `AIRTABLE_API_KEY` - Your Airtable Personal Access Token (get from https://airtable.com/create/tokens)
   - `GEMINI_API_KEY` - (Optional) For AI-powered summaries

4. **Run the app:**
   ```bash
   npm run dev
   ```

### Alternative: In-App Configuration

You can also configure your Airtable connection directly in the app. When you first launch, you'll see a setup modal where you can enter:
- Your Airtable Personal Access Token
- Base ID
- Table IDs and field mappings

## Features

- 🔐 User authentication via Airtable
- ✅ Approval workflow management
- 📝 Digital signature support
- 💰 Budget tracking and payment approvals
- 📊 Contract and milestone management
