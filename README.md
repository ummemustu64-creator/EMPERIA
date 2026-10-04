# EMPERIA LED — Business Website + Admin V7

## Run locally (Windows)
1. Extract this ZIP so `package.json` is directly inside the extracted folder.
2. Open PowerShell in that folder.
3. Run `npm install` (or double-click `start.bat`).
4. Run `npm start`.
5. Open `http://localhost:3000/home.html`.
6. Admin: `http://localhost:3000/admin-login.html`.

Default local master admin password: `admin123`. Change `ADMIN_PASSWORD` before production.

## Added business modules
- Business dashboard with sales KPIs, pipeline value, AOV, conversion and attention alerts
- Leads / Enquiries CRM pipeline: New, Contacted, Qualified, Quoted, Negotiation, Won, Lost
- Customers / CRM records linked to enquiries, quotes and orders
- Quotes with commercial totals, statuses, printable/PDF-ready quotation view and quote-to-order conversion
- Orders with payment, order and delivery statuses
- Sales Analytics: monthly revenue trend, top products, category revenue, funnel and website events
- Inventory: stock, reserved, available, incoming, threshold and warehouse
- Website analytics event tracking for page views, product views, WhatsApp/contact clicks and catalogue downloads
- Products expanded with cost price, selling price, dealer price, GST, MOQ and lead time
- Global admin search across products, customers, orders and leads
- Activity / audit log
- Users & Permissions with Owner, Admin, Sales Manager, Salesperson and Content Manager roles
- Existing product/gallery/project/media/catalogue/settings functionality retained

## Sales data policy
The analytics dashboard calculates only from records actually entered into the system. It does not invent sales, traffic, inventory or conversion figures. Existing catalogue products receive inventory rows with stock set to `0` until the business enters real stock.

## Production
This project remains a lightweight Express + JSON-data application for easy local deployment. Before public production use, move business data to a proper database, use secure production authentication/session storage, HTTPS, rate limiting, backups, stronger file validation, audit retention rules and environment-managed secrets.

## Important
Technical specifications should be checked against the client-approved catalogue before launch. Do not publish invented specifications.
