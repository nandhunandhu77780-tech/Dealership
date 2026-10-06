# Installment Dealer Management System

An initial full-stack web application structure designed for managing installment-based sales, customer accounts, payment schedules, and dealer records.

## Project Structure

```text
installment-dealer/
├── client/
│   ├── src/
│   │   ├── components/       # Reusable UI components
│   │   ├── pages/            # View pages (e.g., Dashboard, Customers)
│   │   ├── layouts/          # Page layouts (e.g., Sidebar, Navbar)
│   │   ├── services/         # API call services
│   │   ├── context/          # React Context providers (e.g., AuthContext)
│   │   ├── hooks/            # Custom React hooks
│   │   ├── assets/           # Static images, icons, illustrations
│   │   ├── App.jsx           # Main React component
│   │   └── main.jsx          # Vite React entry point
│   ├── index.html            # HTML template
│   ├── vite.config.js        # Vite configuration & API proxy
│   └── package.json          # Client dependencies and scripts
│
├── server/
│   ├── controllers/          # Request handlers and business logic
│   ├── models/               # Mongoose database schemas
│   ├── routes/               # Express API routes
│   ├── middleware/           # Custom middleware (auth, error handling)
│   ├── config/               # Database and environment configurations
│   ├── utils/                # Helper functions and utilities
│   ├── server.js             # Express application entry point
│   ├── .env.example          # Sample environment variables
│   └── package.json          # Server dependencies and scripts
│
├── .gitignore
├── README.md
└── package.json              # Root package.json for monorepo scripts
```

---

## Prerequisites

- [Node.js](https://nodejs.org/) (v18 or higher recommended)
- [MongoDB](https://www.mongodb.com/) (for future database integration)

---

## Installation & Setup

### 1. Install Dependencies

You can install dependencies for both the frontend and backend:

#### Option A: From the root folder
```bash
npm run install-all
```

#### Option B: Individually

**Backend:**
```bash
cd server
npm install
```

**Frontend:**
```bash
cd client
npm install
```

---

## Running the Application

### 1. Start the Backend Server

```bash
cd server
npm run dev
```

The Express server will start on `http://localhost:5000`.

### 2. Start the Frontend Application

```bash
cd client
npm run dev
```

The Vite development server will start on `http://localhost:5173`.

---

## Testing the Health Check API

To verify that the Express backend is running correctly, access the health endpoint:

### Using cURL:
```bash
curl http://localhost:5000/api/health
```

### Using Browser:
Navigate to:
[http://localhost:5000/api/health](http://localhost:5000/api/health)

### Expected Response:
```json
{
  "success": true,
  "message": "Installment Dealer API is running"
}
```

---

## Future Roadmap

- [ ] MongoDB connection via Mongoose
- [ ] Authentication using JWT and bcrypt
- [ ] Dealer, Customer, and Product schemas
- [ ] Installment plan creation and calculation engine
- [ ] Payment tracking and ledger records
