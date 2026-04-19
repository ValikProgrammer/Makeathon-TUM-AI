# Makeathon-TUM-AI

## Roles:
### Jack
- processes companies (mock data)
    - data we know about the user: email(not phone), Name,company ... 
- assigns:
    - score (how valuable lead is)
    - motivation string
- stores results in DB
### Cockpit
- dashboard (Kanban)
- shows companies/leads
- moves leades across the kdnban board
- triggers flows
### Landing Page
- user scans QR → opens page ( personalized )
- button: “Request a call” (Enters the number, clicks a button and curl to Kate with number to call for and probebly user ID is made. Kate gets. )
- enters a phone number ()
### Kate
- handles conversation
- ask questions and writes results into DB. Shema ... 
- sends signal: “done”
### Atto
- triggered after Kate finishes
- uses stored data from DB to send an email confirming the order with like mocked linked for payment
    - requred fields: name, boudles and quantites to calc the price, ...

Disclamer: there should be a field showing to which column the lead belongs and each agent modifies it depending  on the state and outcome of the (call for example)
and Cockpit only illustrates it.

## Architectural decisions

### How Cockpit gets data.
Option B — Pull model (✅ correct approach)
Jack → saves to DB
Jack → sends "DONE" signal

Cockpit → reads from DB
Advantages:
single source of truth
clean architecture
scalable
standard backend pattern


### Landing page strategy

Level 3 — Fully dynamic (future)
/landing?user_id=XYZ

Backend:

get(user_id)
→ fetch DB
→ inject into template
→ return HTML

👉 no HTML stored in DB (correct insight from discussion)



### Additional info
Actors: Cockpit, Manager, Jack, Kate, Otto, Emploee
Canband board columns: potential customer,
Pipeline:
1. Manager clicks a button to start information gathering by Jack
2. Cockpit triggers Jack using webhook
3. Jack uses mock data already included in the database (find later) to generate a motivational line and a score
4. Jack writes them into the database
5. Jack generates QR codes for each user_id with
5. Jack sends an email to employee with pdf file or images of
5. Jack notifies cockpit that it is finished (list of user_ids is sent)
6. Cockpit fetches the data base to display new entries in "potential customer" column with:
- Person name
- Company name
- Postal address
- Score
