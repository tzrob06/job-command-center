# Job Command Center

A professional, local-first application designed to help you organize and track your job search. With comprehensive dashboards, a kanban board, and interconnected databases for applications, contacts, and interviews, you can easily manage your entire pipeline in one place.

## Features

- 📊 **Dynamic Dashboards:** Visualize your job search pipeline with interactive charts (Recharts) detailing application status, source breakdowns, and upcoming tasks.
- 📋 **Kanban & List Views:** Manage applications visually via a drag-and-drop-style kanban board or filter/sort through a detailed list view.
- 🔗 **Interconnected Tracking:** Link contacts (recruiters, hiring managers, referrals) and interviews directly to their respective applications.
- 📥 **CSV Import Wizard:** Easily import your existing application history from spreadsheets or external services using the built-in, guided CSV importer.
- 🔒 **Privacy First:** 100% local-first architecture. All your data is securely stored in your browser using IndexedDB. No accounts, no backend, and no tracking.

## Tech Stack

- **Frontend Framework:** React 18 & Vite
- **Styling:** Tailwind CSS
- **Local Database:** Dexie.js (IndexedDB)
- **Data Visualization:** Recharts
- **Routing:** React Router v6
- **Data Parsing:** PapaParse (for CSV uploads)

## Getting Started

### Prerequisites

Ensure you have [Node.js](https://nodejs.org/) (v18+ recommended) installed on your system.

### Installation

1. **Clone the repository:**
   ```bash
   git clone https://github.com/tzrob06/job-command-center.git
   cd job-command-center
   ```

2. **Install dependencies:**
   ```bash
   npm install
   ```

3. **Start the development server:**
   ```bash
   npm run dev
   ```

4. **Open in browser:**
   Navigate to `http://localhost:3000` to start using your Command Center.

## Managing Data

- **Sample Data:** Upon first load, the app is pre-populated with realistic sample data to demonstrate features. You can clear this anytime from the **Settings** page.
- **Exporting/Backups:** Since data is stored in your browser's IndexedDB, it is recommended to regularly use the "Export All Data" feature in **Settings** to create JSON backups.

## License

This project is licensed under the MIT License.
