# KYC Backend Service

Backend service for managing KYC (Know Your Customer) applications with role-based access control and supervisor validation workflow.

The system supports:

- Employee and Supervisor roles
- JWT authentication
- PostgreSQL partitioned table by application status
- Business rule validation for large deposits
- Fuzzy search for OCR text
- Search and pagination
- Secure password hashing

--------------------------------------------------

TECH STACK

- Node.js
- Express.js
- TypeScript
- PostgreSQL
- JWT (jsonwebtoken)
- bcrypt
- Zod validation
- pg_trgm (fuzzy search)

--------------------------------------------------

REQUIREMENTS

- Node.js (LTS recommended)
- PostgreSQL (local)
- npm

Optional:
- DBeaver / pgAdmin

--------------------------------------------------

PROJECT SETUP

1. Install dependencies

npm install

2. Create environment file

Create `.env` in project root:

PORT=3001
DATABASE_URL=postgresql://postgres:your_password@localhost:5432/kyc_db
JWT_SECRET=your_jwt_secret 

Adjust database credentials if needed.

3. Start server

npm run dev

Health check:

GET http://localhost:3001/health

Expected:

{
  "status": "ok"
}

--------------------------------------------------

DATABASE SETUP

Create database:

CREATE DATABASE kyc_db;

Then run schema below.

--------------------------------------------------

DATABASE SCHEMA

-- EXTENSION FOR FUZZY SEARCH
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- ENUMS
CREATE TYPE user_role AS ENUM ('EMPLOYEE', 'SUPERVISOR');

CREATE TYPE kyc_status AS ENUM (
    'PENDING',
    'APPROVED',
    'REJECTED',
    'PENDING_SUPERVISOR'
);

-- USERS TABLE
CREATE TABLE users (
    id SERIAL PRIMARY KEY,
    username VARCHAR(100) NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    role user_role NOT NULL
);

-- PARTITIONED TABLE
CREATE TABLE kyc_applications (
    id SERIAL,
    username VARCHAR(100) NOT NULL,
    first_name VARCHAR(100) NOT NULL,
    last_name VARCHAR(100) NOT NULL,
    document_country VARCHAR(100) NOT NULL,
    document_image_ocr TEXT NOT NULL,
    deposited NUMERIC(12,2) NOT NULL,
    status kyc_status NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) PARTITION BY LIST (status);

-- PARTITIONS
CREATE TABLE kyc_pending
PARTITION OF kyc_applications
FOR VALUES IN ('PENDING');

CREATE TABLE kyc_approved
PARTITION OF kyc_applications
FOR VALUES IN ('APPROVED');

CREATE TABLE kyc_rejected
PARTITION OF kyc_applications
FOR VALUES IN ('REJECTED');

CREATE TABLE kyc_pending_supervisor
PARTITION OF kyc_applications
FOR VALUES IN ('PENDING_SUPERVISOR');

-- INDEXES
CREATE INDEX idx_kyc_username ON kyc_applications(username);

CREATE INDEX idx_kyc_ocr_trgm
ON kyc_applications
USING GIN (document_image_ocr gin_trgm_ops);

--------------------------------------------------

DEV SEED USERS

GET /dev/seed

Creates demo users:

employee1 / Password123! → EMPLOYEE  
supervisor1 / Password123! → SUPERVISOR  

Example:

http://localhost:3001/dev/seed

--------------------------------------------------

AUTHENTICATION

POST /auth/login

Body:

{
  "username": "employee1",
  "password": "Password123!"
}

Response:

{
  "token": "<JWT_TOKEN>"
}

Authorization header:

Authorization: Bearer <JWT_TOKEN>

--------------------------------------------------

KYC API

Create Application (EMPLOYEE)

POST /kyc

{
  "username": "john1",
  "first_name": "John",
  "last_name": "Doe",
  "document_country": "Serbia",
  "document_image_ocr": "OCR text",
  "deposited": 12050
}

--------------------------------------------------

List Applications

GET /kyc?query=&status=&page=&limit=&ocr=

Examples:

GET /kyc?page=1&limit=10  
GET /kyc?query=john  
GET /kyc?status=PENDING  
GET /kyc?ocr=ABOC12  

--------------------------------------------------

FUZZY SEARCH

Fuzzy search is implemented using PostgreSQL pg_trgm extension.

It matches similar OCR text values such as:

- 0 vs O
- minor typos
- partial matches

Similarity threshold is set to 0.1.

Example:

GET /kyc?ocr=J0HN  
GET /kyc?ocr=ABOC12  

--------------------------------------------------

Get Application by ID

GET /kyc/:id

--------------------------------------------------

Approve Application (EMPLOYEE)

PATCH /kyc/:id/approve

--------------------------------------------------

Reject Application (EMPLOYEE)

PATCH /kyc/:id/reject

--------------------------------------------------

Supervisor Final Reject

PATCH /kyc/:id/supervisor/reject

Only allowed if status = PENDING_SUPERVISOR.

Supervisor Override Approve

PATCH /kyc/:id/supervisor/approve

Only allowed if status = PENDING_SUPERVISOR.

--------------------------------------------------

BUSINESS RULE

If an employee rejects an application and:

deposited > 10000

Status becomes:

PENDING_SUPERVISOR

Supervisor must confirm final rejection.

Otherwise status becomes:

REJECTED

--------------------------------------------------

AUTHORIZATION RULES

EMPLOYEE
- Create
- Approve
- Reject

SUPERVISOR
- Final reject validation

AUTHENTICATED USERS
- List
- View

--------------------------------------------------

HTTP STATUS CODES

200 OK  
201 Created  
400 Bad Request  
401 Unauthorized  
403 Forbidden  
404 Not Found  
500 Server Error  

--------------------------------------------------

SECURITY DECISIONS

- Password hashing with bcrypt
- JWT authentication
- Role-based middleware authorization
- Parameterized SQL queries
- Partitioned database for scalability

--------------------------------------------------

ASSUMPTIONS

- User management is out of scope (DEV seed used)
- Multiple KYC records may share same name
- Partitioning required by task
- Backend enforces business rules

--------------------------------------------------

QUICK TEST FLOW

1. Seed users  
GET /dev/seed  

2. Login employee  
POST /auth/login  

3. Create KYC with deposit > 10000  

4. Reject → PENDING_SUPERVISOR  

5. Login supervisor  

6. Supervisor reject → REJECTED  

7. (Optional) Supervisor can override and approve:
	PATCH /kyc/:id/supervisor/approve

--------------------------------------------------

PROJECT STRUCTURE

src
 - config
 - middlewares
 - routes
 - app.ts
 - server.ts

--------------------------------------------------

NOTES

The project focuses on backend architecture, correctness, and business rule enforcement.