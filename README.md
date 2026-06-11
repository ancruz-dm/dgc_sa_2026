# Datamine Global Conference 2026

Official registration website for the Datamine Global Conference 2026.

---

## Overview

The Datamine Global Conference 2026 brings together team members from across the globe to reflect on the achievements of 2026, align around strategic priorities for 2027, and strengthen collaboration across the wider Datamine organisation.

This website serves as the central hub for:

* Event information
* Conference updates
* Travel guidance
* Registration management
* Participant data collection

---

## Event Details

| Item     | Information                                             |
| -------- | ------------------------------------------------------- |
| Event    | Datamine Global Conference 2026                         |
| Location | South Africa                                            |
| Dates    | 22–27 November 2026                                     |
| Audience | Invited Datamine employees                              |
| Contact  | Anton Clowes                                            |
| Email    | [anton.clowes@vigsw.com](mailto:anton.clowes@vigsw.com) |

---

## Project Goals

This platform has been designed to:

* Provide a premium event experience for attendees
* Centralise event information and communications
* Collect registration data securely
* Support travel and logistics planning
* Capture dietary, accessibility, emergency and merchandise requirements
* Export attendee information for event operations and reporting

---

## Technology Stack

### Frontend

* HTML5
* CSS3
* Vanilla JavaScript

### Backend

* Supabase

### Database

* PostgreSQL (Supabase)

### Hosting

* GitHub Pages

---

## Registration Data Captured

The registration workflow collects:

### Personal Information

* Full name
* Work email
* WhatsApp number

### Professional Information

* Job title
* Business unit / region
* Office location
* Office country

### Travel Information

* Country of residence
* Departure city
* Visa requirements
* Yellow fever requirements
* Arrival details
* Departure details

### Ground Transportation

* Airport transfer requirements

### Dietary Information

* Dietary restrictions
* Food allergies
* Additional dietary notes

### Health & Emergency

* Medical considerations
* Medications
* EpiPen requirements
* Emergency contact information
* Travel insurance confirmation

### Accessibility

* Mobility requirements
* Accessibility needs

### Programme Preferences

* Preferred conference topics

### Merchandise

* T-shirt size

### Compliance

* Privacy policy acceptance
* Terms acceptance

---

## Security

The project uses Supabase Row Level Security (RLS).

Public users are permitted to submit registrations only.

Public access to registration data is blocked.

Registration data can only be viewed by authenticated users with the appropriate permissions.

No participant data is exposed through the public website.

---

## Database

Primary table:

```sql
public.registrations
```

The registration schema supports:

* Participant management
* Logistics planning
* Merchandise fulfilment
* Emergency preparedness
* Reporting and export workflows

---

## Reporting

Registration data can be exported for:

* Excel
* CSV
* Power BI
* Operational event reporting

---

## Development

Clone the repository:

```bash
git clone <repository-url>
```

Open the project locally:

```bash
index.html
```

Configure Supabase credentials:

```javascript
const SUPABASE_URL = 'YOUR_SUPABASE_URL';
const SUPABASE_ANON_KEY = 'YOUR_SUPABASE_ANON_KEY';
```

---

## Brand Guidelines

Primary colours:

```text
#638BA3
#83C3DB
#446C84
#343434
```

Design principles:

* Clean
* Modern
* Premium
* Executive
* Conference-focused
* Mobile-first
* Accessible

---

## Project Status

Active Development

Version: 2.0

Event Year: 2026

---

## Maintainers

### Event Owner

Anton Clowes

[anton.clowes@vigsw.com](mailto:anton.clowes@vigsw.com)

### Project Owner

Anna Cruz

Datamine

---

© Datamine Global Conference 2026
