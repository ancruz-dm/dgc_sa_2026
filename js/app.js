/**
 * Datamine Global Conference 2026 — app.js
 * Version 3
 *
 * New in v3:
 *  - Email gate: Supabase lookup against approved_attendees before form renders
 *  - 5 gate outcomes: not found / fully registered / flight pending / new user / error
 *  - Profile pre-population from approved_attendees (editable by user)
 *  - Gender field in Step 1, tshirt_fit pre-filled from gender
 *  - Flight booked toggle in Step 3 — shows/hides flight detail fields
 *  - Flight-pending resume flow: PATCH existing record, jump to Step 3
 *  - flight_info_pending + gender + attendance_status written to registrations
 *
 * preferred_topics is TEXT (not array) per database schema.
 */

'use strict';

/* ============================================================
   CONFIG
   ============================================================ */
const CONFIG = {
  SUPABASE_URL:      'https://uyqgxuwqiqrkyzbnhxph.supabase.co',
  SUPABASE_ANON_KEY: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InV5cWd4dXdxaXFya3l6Ym5oeHBoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODExMzMxNDEsImV4cCI6MjA5NjcwOTE0MX0.K5qBJZgRagrsgRhBVkBBFKk5keHRQc1HplOO9ClHXEU',
  EVENT_DATE:        new Date('2026-11-22T08:00:00+02:00'),
  TOTAL_STEPS:       9,
};

/* ============================================================
   SUPABASE HELPERS
   ============================================================ */
const SB = {
  headers(extra = {}) {
    return {
      'Content-Type':  'application/json',
      'apikey':        CONFIG.SUPABASE_ANON_KEY,
      'Authorization': 'Bearer ' + CONFIG.SUPABASE_ANON_KEY,
      ...extra,
    };
  },

  async get(path) {
    const res = await fetch(CONFIG.SUPABASE_URL + path, { headers: this.headers() });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    return res.json();
  },
};

/* ============================================================
   GATE SERVICE
   Resolves the email against approved_attendees and registrations.
   Returns one of 5 outcomes:
     { outcome: 'not_found' }
     { outcome: 'registered' }
     { outcome: 'flight_pending', registrationId, invitee }
     { outcome: 'new_user', invitee }
     { outcome: 'error', message }
   ============================================================ */
const GateService = {

  async check(email) {
    const normalised = email.trim().toLowerCase();

    try {
      // 1. Check approved_attendees
      const invitees = await SB.get(
        `/rest/v1/approved_attendees?email=eq.${encodeURIComponent(normalised)}&select=*&limit=1`
      );

      if (!invitees || invitees.length === 0) {
        return { outcome: 'not_found' };
      }

      const invitee = invitees[0];

      // 2. Check registrations for existing record
      const regs = await SB.get(
        `/rest/v1/registrations?work_email=eq.${encodeURIComponent(normalised)}&select=id,registration_status,flight_info_pending&limit=1`
      );

      if (!regs || regs.length === 0) {
        return { outcome: 'new_user', invitee };
      }

      const reg = regs[0];

      // Flight pending takes priority over complete — allows resume
      if (reg.flight_info_pending === true) {
        return { outcome: 'flight_pending', registrationId: reg.id, invitee };
      }

      return { outcome: 'registered' };

    } catch (err) {
      console.error('[GateService.check]', err);
      return {
        outcome: 'error',
        message: !navigator.onLine
          ? 'You appear to be offline. Please check your connection and try again.'
          : 'Could not verify your email. Please try again or contact aclowes@carinasw.com.',
      };
    }
  },

};

/* ============================================================
   REGISTRATION SERVICE
   ============================================================ */
const RegistrationService = {

  async submit(payload) {
    try {
      const response = await fetch(CONFIG.SUPABASE_URL + '/rest/v1/registrations', {
        method: 'POST',
        headers: {
          ...SB.headers(),
          'Prefer': 'return=minimal',
        },
        body: JSON.stringify(payload),
      });

      if (response.status === 201 || response.status === 200) {
        return { success: true };
      }

      // Parse the error body so we can see exactly what Supabase rejected
      let errBody = {};
      try { errBody = await response.json(); } catch { /* non-JSON body */ }
      console.error('[RegistrationService.submit] HTTP', response.status, JSON.stringify(errBody));

      if (response.status === 409) {
        return {
          success: false,
          error: 'This email address has already been registered. Contact aclowes@carinasw.com if you need to update your details.',
        };
      }

      if (response.status === 403 || response.status === 401) {
        return {
          success: false,
          error: 'Access denied. Your email address is not authorised to register. Please contact aclowes@carinasw.com.',
        };
      }

      const detail = errBody.message || errBody.hint || errBody.details || '';
      return {
        success: false,
        error: `Submission failed (HTTP ${response.status}${detail ? ': ' + detail : ''}). Please try again or contact aclowes@carinasw.com.`,
      };

    } catch (err) {
      console.error('[RegistrationService.submit] Network error', err);
      return {
        success: false,
        error: !navigator.onLine
          ? 'You appear to be offline. Please check your connection and try again.'
          : 'Could not reach the registration service. Please try again or contact aclowes@carinasw.com.',
      };
    }
  },

  // PATCH existing registration — used for flight-pending resume
  async updateFlight(registrationId, flightPayload) {
    try {
      const response = await fetch(
        CONFIG.SUPABASE_URL + '/rest/v1/registrations?id=eq.' + registrationId,
        {
          method: 'PATCH',
          headers: {
            ...SB.headers(),
            'Prefer': 'return=minimal',
          },
          body: JSON.stringify(flightPayload),
        }
      );

      if (response.status === 204 || response.status === 200) {
        return { success: true };
      }

      return {
        success: false,
        error: 'Could not update flight details (HTTP ' + response.status + '). Please try again or contact aclowes@carinasw.com.',
      };

    } catch {
      return {
        success: false,
        error: !navigator.onLine
          ? 'You appear to be offline. Please check your connection and try again.'
          : 'Could not reach the registration service. Please try again or contact aclowes@carinasw.com.',
      };
    }
  },

  async getStats() {
    try {
      const response = await fetch(CONFIG.SUPABASE_URL + '/rest/v1/rpc/get_registration_stats', {
        method: 'POST',
        headers: SB.headers(),
        body: JSON.stringify({}),
      });
      if (!response.ok) return { confirmed: 0, countries: 0 };
      return await response.json();
    } catch {
      return { confirmed: 0, countries: 0 };
    }
  },

};

/* ============================================================
   GATE STATE
   Tracks what we know after the email lookup.
   ============================================================ */
const GateState = {
  email:          null,   // normalised email from gate
  invitee:        null,   // row from approved_attendees
  mode:           null,   // 'new' | 'resume_flight'
  registrationId: null,   // set when resuming flight
};

/* ============================================================
   FORM STATE — in-memory only
   ============================================================ */
const FormState = {
  currentStep: 1,
  data: {},
  draftKey: 'dm_conf_2026_draft',

  merge(stepData) {
    this.data = { ...this.data, ...stepData };
    this._saveDraft();
  },

  _sensitiveFields: [
    'medicalConditions', 'medications', 'carriesEpipen',
    'emergencyContactName', 'emergencyContactRelationship', 'emergencyContactPhone',
    'foodAllergies', 'dietaryNotes', 'mobilityRequirements', 'accessibilityRequirements',
  ],

  _saveDraft() {
    try {
      const safe = { ...this.data };
      this._sensitiveFields.forEach(f => delete safe[f]);
      sessionStorage.setItem(this.draftKey, JSON.stringify(safe));
    } catch { /* sessionStorage may be unavailable */ }
  },

  loadDraft() {
    try {
      const raw = sessionStorage.getItem(this.draftKey);
      if (raw) this.data = JSON.parse(raw);
    } catch { /* ignore */ }
  },

  clearDraft() {
    try { sessionStorage.removeItem(this.draftKey); } catch { /* ignore */ }
  },

  buildPayload() {
    const sanitise = val =>
      typeof val === 'string' ? val.trim().replace(/[<>]/g, '') : val;

    const orNull = val => {
      if (val === null || val === undefined) return null;
      const s = String(val).trim();
      return s === '' ? null : s;
    };

    const flightBooked   = this.data.flightBooked === 'yes';
    const flightPending  = !flightBooked;

    return {
      // Identity — email captured at gate
      full_name:    sanitise(this.data.fullName || ''),
      work_email:   GateState.email,
      gender:       orNull(this.data.gender),
      whatsapp_number: orNull(this.data.whatsappNumber),

      // Professional
      job_title:      orNull(this.data.jobTitle),
      business_unit:  orNull(this.data.businessUnit),
      office_location: orNull(this.data.officeLocation),
      office_country:  orNull(this.data.officeCountry),

      // Travel
      country_of_residence: orNull(this.data.countryOfResidence),
      departure_city:       orNull(this.data.departureCity),
      visa_status:          orNull(this.data.visaRequired),
      yellow_fever_certificate_required: orNull(this.data.yellowFeverRequired),

      // Flights — null when pending, real values when booked
      arrival_datetime: flightBooked && this.data.arrivalDate
        ? `${this.data.arrivalDate}T${(this.data.arrivalTime || '12:00').slice(0,5)}:00+00:00`
        : null,
      departure_datetime: flightBooked && this.data.departureDate
        ? `${this.data.departureDate}T${(this.data.departureTime || '12:00').slice(0,5)}:00+00:00`
        : null,

      // Flight pending flag
      flight_info_pending: flightPending,

      // Transfers
      airport_transfer_arrival:   orNull(this.data.airportTransferArrival),
      airport_transfer_departure: orNull(this.data.airportTransferDeparture),

      // Dietary
      dietary_restrictions: orNull(this.data.dietaryRestrictions),
      food_allergies:       orNull(this.data.foodAllergies),
      dietary_notes:        orNull(this.data.dietaryNotes),

      // Health & emergency
      medical_conditions:              orNull(this.data.medicalConditions),
      medications:                     orNull(this.data.medications),
      carries_epipen: this.data.carriesEpipen === 'yes' || this.data.carriesEpipen === true,
      emergency_contact_name:          orNull(this.data.emergencyContactName),
      emergency_contact_relationship:  orNull(this.data.emergencyContactRelationship),
      emergency_contact_phone:         orNull(this.data.emergencyContactPhone),
      travel_insurance_confirmed:      orNull(this.data.travelInsurance),

      // Accessibility
      mobility_requirements:      orNull(this.data.mobilityRequirements),
      accessibility_requirements: orNull(this.data.accessibilityRequirements),

      // Programme — TEXT not array
      preferred_topics: orNull(this.data.preferredTopics),

      // Merchandise
      tshirt_size: orNull(this.data.tshirtSize),
      tshirt_fit:  orNull(this.data.tshirtFit),

      // Status — must match registrations_registration_status_check constraint:
      // 'submitted' | 'reviewed' | 'approved' | 'completed'
      // flight_info_pending flag carries the pending state separately.
      registration_status: 'submitted',
      attendance_status:   'attending',

      // Consent
      privacy_policy_accepted: this.data.privacyAccepted === true || this.data.privacyAccepted === 'true',
      terms_accepted:          this.data.termsAccepted === true   || this.data.termsAccepted === 'true',
    };
  },

  // Payload for flight-pending PATCH — only flight + transfer fields.
  // Country, departure city, visa, yellow fever are already stored from
  // the initial registration and must not be overwritten here.
  buildFlightPayload() {
    const orNull = val => {
      if (val === null || val === undefined) return null;
      const s = String(val).trim();
      return s === '' ? null : s;
    };

    return {
      arrival_datetime: this.data.arrivalDate
        ? `${this.data.arrivalDate}T${(this.data.arrivalTime || '12:00').slice(0,5)}:00+00:00`
        : null,
      departure_datetime: this.data.departureDate
        ? `${this.data.departureDate}T${(this.data.departureTime || '12:00').slice(0,5)}:00+00:00`
        : null,
      airport_transfer_arrival:   orNull(this.data.airportTransferArrival),
      airport_transfer_departure: orNull(this.data.airportTransferDeparture),
      flight_info_pending: false,
      registration_status: 'submitted',
    };
  },
};

/* ============================================================
   EMAIL GATE HANDLER
   Called when user clicks Continue on the gate screen.
   ============================================================ */
async function handleEmailGate() {
  const emailInput = document.getElementById('gate-email');
  const errorEl    = document.getElementById('gate-email-error');
  const btn        = document.getElementById('gate-btn');

  const email = emailInput.value.trim().toLowerCase().replace(/\s+/g, '');

  // Basic format validation
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    emailInput.classList.add('invalid');
    errorEl.textContent = 'Please enter a valid email address.';
    emailInput.focus();
    return;
  }

  emailInput.classList.remove('invalid');
  errorEl.textContent = '';

  // Loading state
  const btnLabel   = btn.querySelector('.btn-label');
  const btnLoading = btn.querySelector('.btn-loading');
  btn.disabled       = true;
  btnLabel.hidden    = true;
  btnLoading.hidden  = false;

  // Hide all outcome messages
  hideAllGateMsgs();

  const result = await GateService.check(email);

  btn.disabled      = false;
  btnLabel.hidden   = false;
  btnLoading.hidden = true;

  switch (result.outcome) {

    case 'not_found':
      document.getElementById('gate-msg-notfound').hidden = false;
      break;

    case 'registered':
      document.getElementById('gate-msg-registered').hidden = false;
      break;

    case 'flight_pending':
      GateState.email          = email;
      GateState.invitee        = result.invitee;
      GateState.mode           = 'resume_flight';
      GateState.registrationId = result.registrationId;
      document.getElementById('gate-msg-flightpending').hidden = false;
      break;

    case 'new_user':
      GateState.email   = email;
      GateState.invitee = result.invitee;
      GateState.mode    = 'new';
      openFormForNewUser(result.invitee);
      break;

    case 'error':
    default:
      document.getElementById('gate-error-detail').textContent =
        result.message || 'Please try again or contact aclowes@carinasw.com.';
      document.getElementById('gate-msg-error').hidden = false;
      break;
  }
}

function hideAllGateMsgs() {
  ['gate-msg-notfound', 'gate-msg-registered', 'gate-msg-flightpending', 'gate-msg-error'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.hidden = true;
  });
}

/* ============================================================
   OPEN FORM — new user
   Hides the gate, shows the form, pre-populates fields.
   ============================================================ */
function openFormForNewUser(invitee) {
  document.getElementById('email-gate').hidden    = true;
  document.getElementById('reg-form-wrap').hidden = false;

  if (invitee) {
    // Step 1 — personal
    setField('f-fullname', invitee.full_name);
    setField('f-gender',   invitee.gender);       // <select>

    // Step 2 — professional
    setField('f-jobtitle',      invitee.job_title);
    setField('f-businessunit',  invitee.business_unit);
    setField('f-officelocation', invitee.office_location);
    setField('f-officecountry',  invitee.office_country); // country autocomplete text input

    // Step 3 — travel: pre-fill country of residence = office country,
    // departure city = office location (both editable)
    setField('f-residencecountry', invitee.office_country);
    setField('f-departurecity',    invitee.office_location);

    // Step 9 — tshirt fit pre-filled from gender
    const fit = invitee.gender === 'Female' ? 'Fitted' : 'Standard';
    setField('f-tshirtfit', fit);

    // Store everything in FormState so payload picks it up
    // (user may skip editing these steps and the DOM values won't be
    //  re-collected unless we seed FormState here)
    FormState.merge({
      fullName:           invitee.full_name       || '',
      gender:             invitee.gender          || '',
      jobTitle:           invitee.job_title       || '',
      businessUnit:       invitee.business_unit   || '',
      officeLocation:     invitee.office_location || '',
      officeCountry:      invitee.office_country  || '',
      countryOfResidence: invitee.office_country  || '',
      departureCity:      invitee.office_location || '',
      tshirtFit:          fit,
    });
  }

  showStep(0, 1);
  scrollToForm();
}

/* ============================================================
   RESUME FLIGHT DETAILS — returning user
   Shows Step 3 but hides everything already submitted.
   Only the flight dates/times and transfers are shown.
   ============================================================ */
function resumeFlightDetails() {
  document.getElementById('email-gate').hidden    = true;
  document.getElementById('reg-form-wrap').hidden = false;

  updateStepIndicatorForResume();

  // Show step 3, hide all others
  FormState.currentStep = 3;
  document.querySelectorAll('.form-step-panel').forEach(p => { p.hidden = true; });
  const step3 = document.getElementById('form-step-3');
  if (step3) step3.hidden = false;

  // Hide the general travel fields — already submitted on first registration
  // Only show the flight-fields block (dates, times, transfers)
  const fieldsToHide = [
    'flight-booked-group',       // "Do you have flights booked?" radio
    'wrap-residencecountry',     // country of residence
    'f-departurecity',           // departure city
    'f-visarequired',            // visa select
    'f-yellowfever',             // yellow fever select
  ];
  fieldsToHide.forEach(id => {
    // Hide the closest form-group wrapper so label + error also disappear
    const el = document.getElementById(id);
    if (!el) return;
    const group = el.closest('.form-group') || el.closest('[role="radiogroup"]')?.closest('.form-group');
    if (group) group.hidden = true;
  });

  // Also hide the flight booked radio label/group directly
  const flightBookedGroup = document.getElementById('flight-booked-group');
  if (flightBookedGroup) {
    const wrapper = flightBookedGroup.closest('.form-group');
    if (wrapper) wrapper.hidden = true;
  }

  // Show flight-fields block and make all its fields required
  const flightFields = document.getElementById('flight-fields');
  if (flightFields) {
    flightFields.hidden = false;
    ['f-arrivaldate','f-arrivaltime','f-departuredate','f-departuretime',
     'f-transferarrival','f-transferdeparture'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.setAttribute('required', '');
    });
  }

  // Update heading and description for context
  const heading = step3.querySelector('.form-step-heading');
  if (heading) heading.textContent = 'Flight & Transfer Details';
  const desc = step3.querySelector('.form-step-desc');
  if (desc) desc.textContent = 'Add your flight information and transfer requirements to complete your registration.';

  // Back button — returns to gate flight-pending message
  const backBtn = step3.querySelector('.btn-ghost');
  if (backBtn) {
    backBtn.onclick = () => {
      document.getElementById('reg-form-wrap').hidden = true;
      document.getElementById('email-gate').hidden    = false;
      hideAllGateMsgs();
      document.getElementById('gate-msg-flightpending').hidden = false;
    };
  }

  // Continue button — submits flight PATCH instead of proceeding to Step 4
  const continueBtn = step3.querySelector('.btn-primary');
  if (continueBtn) {
    continueBtn.onclick = () => submitFlightUpdate();
    const label = continueBtn.querySelector('.btn-label');
    if (label) label.textContent = 'Save flight details';
  }

  scrollToForm();
}

function updateStepIndicatorForResume() {
  document.querySelectorAll('.form-step-item').forEach(item => {
    const step = parseInt(item.dataset.step, 10);
    item.classList.remove('active', 'completed');
    if (step === 3) {
      item.classList.add('active');
    } else if (step < 3) {
      item.classList.add('completed');
      const dot = item.querySelector('.form-step-dot');
      if (dot) dot.textContent = '✓';
    }
  });
}

/* ============================================================
   FLIGHT FIELDS TOGGLE
   Called by the "Do you have flights booked?" radio in Step 3.
   Shows/hides the entire flight-fields block (dates + transfers).
   When hidden, removes required from all contained fields so
   validation never blocks on them.
   ============================================================ */
function toggleFlightFields(value) {
  const flightFields = document.getElementById('flight-fields');
  if (!flightFields) return;

  const conditionalIds = [
    'f-arrivaldate', 'f-arrivaltime', 'f-departuredate', 'f-departuretime',
    'f-transferarrival', 'f-transferdeparture',
  ];

  if (value === 'yes') {
    flightFields.hidden = false;
    conditionalIds.forEach(id => {
      const el = document.getElementById(id);
      if (el) el.setAttribute('required', '');
    });
  } else {
    flightFields.hidden = true;
    conditionalIds.forEach(id => {
      const el = document.getElementById(id);
      if (el) {
        el.removeAttribute('required');
        // Clear any stale validation state
        el.classList.remove('invalid');
        const errEl = document.getElementById(id.replace('f-', 'err-'));
        if (errEl) errEl.textContent = '';
      }
    });
  }
}

/* ============================================================
   FORM VALIDATION
   ============================================================ */
const Validator = {
  rules: {
    'f-fullname':         { required: true, label: 'Full name' },
    'f-gender':           { required: true, label: 'Gender' },
    'f-jobtitle':         { required: true, label: 'Job title' },
    'f-businessunit':     { required: true, label: 'Business unit' },
    'f-residencecountry': { required: true, label: 'Country of residence', validate: v => COUNTRIES.includes(v) || 'Please select a country from the list.' },
    'f-departurecity':    { required: true, label: 'Departure city' },
    // Flight fields — conditionally required via toggleFlightFields
    'f-arrivaldate':      { required: false, label: 'Arrival date' },
    'f-arrivaltime':      { required: false, label: 'Arrival time' },
    'f-departuredate':    { required: false, label: 'Departure date' },
    'f-departuretime':    { required: false, label: 'Departure time' },
    // Transfer fields — conditionally required (inside flight-fields block)
    'f-transferarrival':  { required: false, label: 'Arrival transfer' },
    'f-transferdeparture':{ required: false, label: 'Departure transfer' },
    'f-tshirtfit':        { required: true,  label: 'T-shirt fit' },
    'f-emergencyname':    { required: true,  label: 'Emergency contact name' },
    'f-emergencyrelation':{ required: true,  label: 'Relationship' },
    'f-emergencyphone':   { required: true,  label: 'Emergency contact phone', pattern: /^[+\d\s().\-]{7,20}$/ },
  },

  setFieldError(field, errId, msg) {
    const errEl = document.getElementById(errId);
    if (msg) {
      field.classList.add('invalid');
      if (errEl) errEl.textContent = msg;
    } else {
      field.classList.remove('invalid');
      if (errEl) errEl.textContent = '';
    }
  },

  validateStep(step) {
    const stepEl = document.getElementById('form-step-' + step);
    if (!stepEl) return true;

    let valid = true;

    // Required inputs/selects/textareas (honours the required attribute)
    const fields = stepEl.querySelectorAll('[required]');
    fields.forEach(field => {
      // Skip hidden fields (flight details when not booked)
      if (field.closest('[hidden]')) return;

      const value = field.value.trim();
      const rule  = this.rules[field.id];
      const errId = field.id.replace('f-', 'err-');
      let error   = '';

      if (!value) {
        error = (rule ? rule.label : field.name) + ' is required.';
      } else if (rule && rule.pattern && !rule.pattern.test(value)) {
        error = 'Please enter a valid ' + rule.label.toLowerCase() + '.';
      } else if (rule && rule.validate) {
        const result = rule.validate(value);
        if (result !== true) error = result;
      }

      this.setFieldError(field, errId, error);
      if (error) valid = false;
    });

    // Step 3: flight booked radio required
    if (step === 3) {
      const flightBooked = document.querySelector('input[name="flightBooked"]:checked');
      const errEl = document.getElementById('err-flightbooked');
      if (!flightBooked) {
        if (errEl) errEl.textContent = 'Please indicate whether your flights are booked.';
        valid = false;
      } else {
        if (errEl) errEl.textContent = '';
      }
    }

    // Step 5 (Health): radio groups — EpiPen and travel insurance
    if (step === 5) {
      const epipen = document.querySelector('input[name="carriesEpipen"]:checked');
      const errEpipen = document.getElementById('err-epipen');
      if (!epipen) {
        if (errEpipen) errEpipen.textContent = 'Please indicate whether you carry an EpiPen.';
        valid = false;
      } else {
        if (errEpipen) errEpipen.textContent = '';
      }

      const insurance = document.querySelector('input[name="travelInsurance"]:checked');
      const errInsurance = document.getElementById('err-travelinsurance');
      if (!insurance) {
        if (errInsurance) errInsurance.textContent = 'Please confirm your travel insurance status.';
        valid = false;
      } else {
        if (errInsurance) errInsurance.textContent = '';
      }
    }

    // Step 8 (Merch): t-shirt size
    if (step === 8) {
      const selected = document.querySelector('input[name="tshirtSize"]:checked');
      const errEl = document.getElementById('err-tshirt');
      if (!selected) {
        if (errEl) errEl.textContent = 'Please select a t-shirt size.';
        valid = false;
      } else {
        if (errEl) errEl.textContent = '';
      }
    }

    // Step 9 (Consent): checkboxes
    if (step === 9) {
      ['f-privacy', 'f-terms'].forEach(id => {
        const cb = document.getElementById(id);
        const errId = id.replace('f-', 'err-');
        const errEl = document.getElementById(errId);
        if (cb && !cb.checked) {
          if (errEl) errEl.textContent = 'This confirmation is required.';
          valid = false;
        } else if (errEl) {
          errEl.textContent = '';
        }
      });
    }

    return valid;
  },
};

/* ============================================================
   FORM STEP DATA COLLECTION
   ============================================================ */
function collectStepData(step) {
  const stepEl = document.getElementById('form-step-' + step);
  if (!stepEl) return {};

  const data = {};

  stepEl.querySelectorAll('input[type="radio"]:checked').forEach(r => {
    data[toCamel(r.name)] = r.value;
  });

  stepEl.querySelectorAll('input[type="checkbox"]').forEach(cb => {
    data[toCamel(cb.name)] = cb.checked;
  });

  stepEl.querySelectorAll('input:not([type="radio"]):not([type="checkbox"])').forEach(el => {
    if (el.name) data[toCamel(el.name)] = el.value;
  });

  stepEl.querySelectorAll('select').forEach(el => {
    if (el.name) data[toCamel(el.name)] = el.value;
  });

  stepEl.querySelectorAll('textarea').forEach(el => {
    if (el.name) data[toCamel(el.name)] = el.value;
  });

  return data;
}

function toCamel(str) {
  return str.replace(/-./g,  x => x[1].toUpperCase())
            .replace(/_./g,  x => x[1].toUpperCase());
}

/* ============================================================
   MULTI-STEP NAVIGATION
   ============================================================ */
function nextStep(current) {
  if (!Validator.validateStep(current)) return;

  FormState.merge(collectStepData(current));

  const next = current + 1;
  if (next > CONFIG.TOTAL_STEPS) return;

  showStep(current, next);
}

function prevStep(current) {
  FormState.merge(collectStepData(current));
  const prev = current - 1;
  if (prev < 1) return;
  showStep(current, prev);
}

function showStep(from, to) {
  const fromEl = document.getElementById('form-step-' + from);
  const toEl   = document.getElementById('form-step-' + to);

  if (fromEl) fromEl.hidden = true;
  if (toEl)   toEl.hidden   = false;

  FormState.currentStep = to;
  updateStepIndicator(to);

  // Re-apply any stored FormState values to the newly visible step.
  // This handles cases where pre-populated fields (gender, tshirtFit)
  // weren't picked up by setField because the step was hidden at gate time.
  applyStoredToStep(to);

  scrollToForm();
}

// Apply FormState.data values to input/select fields in a given step panel.
// Only sets fields that are currently empty, so user edits are never overwritten.
function applyStoredToStep(step) {
  const stepEl = document.getElementById('form-step-' + step);
  if (!stepEl) return;

  const fieldMap = {
    'f-fullname':        'fullName',
    'f-gender':          'gender',
    'f-jobtitle':        'jobTitle',
    'f-businessunit':    'businessUnit',
    'f-officelocation':  'officeLocation',
    'f-officecountry':   'officeCountry',
    'f-residencecountry':'countryOfResidence',
    'f-departurecity':   'departureCity',
    'f-tshirtfit':       'tshirtFit',
  };

  Object.entries(fieldMap).forEach(([fieldId, stateKey]) => {
    const el = stepEl.querySelector('#' + fieldId);
    if (!el) return;
    const stored = FormState.data[stateKey];
    if (!stored) return;
    // Only fill if currently empty so user edits aren't clobbered
    if (el.value === '' || el.value === null) {
      el.value = stored;
    }
  });
}

function updateStepIndicator(current) {
  document.querySelectorAll('.form-step-item').forEach(item => {
    const step = parseInt(item.dataset.step, 10);
    item.classList.remove('active', 'completed');
    if (step === current) {
      item.classList.add('active');
    } else if (step < current) {
      item.classList.add('completed');
      const dot = item.querySelector('.form-step-dot');
      if (dot && dot.textContent !== '✓') dot.textContent = '✓';
    }
  });
}

function scrollToForm() {
  const formWrap = document.getElementById('reg-form-wrap') || document.getElementById('email-gate');
  if (formWrap) {
    const top = formWrap.getBoundingClientRect().top + window.scrollY - (72 + 20);
    window.scrollTo({ top, behavior: 'smooth' });
  }
}

/* ============================================================
   FORM SUBMISSION — new registration
   ============================================================ */
async function submitRegistration() {
  if (!Validator.validateStep(9)) return;

  FormState.merge(collectStepData(9));

  const submitBtn  = document.getElementById('submit-btn');
  const btnLabel   = submitBtn.querySelector('.btn-label');
  const btnLoading = submitBtn.querySelector('.btn-loading');
  const errorBox   = document.getElementById('error-box');
  const errorMsg   = document.getElementById('error-message');

  submitBtn.disabled = true;
  if (btnLabel)   btnLabel.hidden   = true;
  if (btnLoading) btnLoading.hidden = false;
  if (errorBox)   errorBox.hidden   = true;

  const payload = FormState.buildPayload();
  console.log('[submitRegistration] payload', JSON.stringify(payload, null, 2));
  const result  = await RegistrationService.submit(payload);

  if (result.success) {
    FormState.clearDraft();
    document.getElementById('reg-form-wrap').hidden = true;
    document.getElementById('success-box').hidden   = false;
    scrollToForm();
  } else {
    submitBtn.disabled = false;
    if (btnLabel)   btnLabel.hidden   = false;
    if (btnLoading) btnLoading.hidden = true;

    if (errorBox && errorMsg) {
      errorMsg.textContent = result.error;
      errorBox.hidden = false;
      errorBox.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
  }
}

/* ============================================================
   FLIGHT UPDATE SUBMISSION — resume flow
   ============================================================ */
async function submitFlightUpdate() {
  // Only validate the flight-fields block — country/city are already stored
  const flightFields = [
    'f-arrivaldate', 'f-arrivaltime',
    'f-departuredate', 'f-departuretime',
    'f-transferarrival', 'f-transferdeparture',
  ];
  let valid = true;

  flightFields.forEach(id => {
    const el = document.getElementById(id);
    if (!el) return;
    const rule  = Validator.rules[id];
    const errId = id.replace('f-', 'err-');
    if (!el.value.trim()) {
      Validator.setFieldError(el, errId, (rule ? rule.label : id) + ' is required.');
      valid = false;
    } else {
      Validator.setFieldError(el, errId, '');
    }
  });

  if (!valid) return;

  FormState.merge(collectStepData(3));

  // Repurpose submit button on step 3
  const btn       = document.querySelector('#form-step-3 .btn-primary');
  const origText  = btn ? btn.textContent : '';
  if (btn) { btn.disabled = true; btn.textContent = 'Saving…'; }

  const errorBox = document.getElementById('error-box');
  if (errorBox) errorBox.hidden = true;

  const payload = FormState.buildFlightPayload();
  const result  = await RegistrationService.updateFlight(GateState.registrationId, payload);

  if (result.success) {
    FormState.clearDraft();
    document.getElementById('reg-form-wrap').hidden    = true;
    document.getElementById('success-box-flight').hidden = false;
    scrollToForm();
  } else {
    if (btn) { btn.disabled = false; btn.textContent = origText; }
    const errorMsg = document.getElementById('error-message');
    if (errorBox && errorMsg) {
      errorMsg.textContent = result.error;
      errorBox.hidden = false;
      errorBox.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
  }
}

/* ============================================================
   FIELD HELPER
   Handles: regular inputs, <select> elements, and the country
   autocomplete inputs (plain text inputs validated against COUNTRIES).
   ============================================================ */
function setField(id, value) {
  if (value === null || value === undefined || value === '') return;
  const el = document.getElementById(id);
  if (!el) return;
  el.value = value;
  // For select elements, confirm the option exists before leaving it set
  if (el.tagName === 'SELECT') {
    const match = Array.from(el.options).some(o => o.value === value);
    if (!match) el.value = '';
  }
}

/* ============================================================
   PROGRAMME TAB SWITCHER
   ============================================================ */
function showDay(event, dayId) {
  document.querySelectorAll('.day-tab').forEach(tab => {
    tab.classList.remove('active');
    tab.setAttribute('aria-selected', 'false');
  });

  document.querySelectorAll('.day-content').forEach(panel => {
    panel.classList.remove('active');
    panel.hidden = true;
  });

  if (event && event.currentTarget) {
    event.currentTarget.classList.add('active');
    event.currentTarget.setAttribute('aria-selected', 'true');
  }

  const target = document.getElementById('day-' + dayId);
  if (target) {
    target.classList.add('active');
    target.hidden = false;
  }
}

/* ============================================================
   FAQ ACCORDION
   ============================================================ */
function toggleFaq(btn) {
  const isOpen = btn.getAttribute('aria-expanded') === 'true';
  const answer = btn.nextElementSibling;

  document.querySelectorAll('.faq-question[aria-expanded="true"]').forEach(other => {
    if (other !== btn) {
      other.setAttribute('aria-expanded', 'false');
      const otherAnswer = other.nextElementSibling;
      if (otherAnswer) otherAnswer.hidden = true;
    }
  });

  btn.setAttribute('aria-expanded', String(!isOpen));
  if (answer) answer.hidden = isOpen;
}

/* ============================================================
   COUNTDOWN
   ============================================================ */
function updateCountdown() {
  const now  = Date.now();
  const diff = CONFIG.EVENT_DATE.getTime() - now;

  const cdDays  = document.getElementById('cd-days');
  const cdHours = document.getElementById('cd-hours');
  const cdMins  = document.getElementById('cd-mins');
  const cdSecs  = document.getElementById('cd-secs');

  if (!cdDays) return;

  if (diff <= 0) {
    cdDays.textContent = cdHours.textContent = cdMins.textContent = cdSecs.textContent = '0';
    return;
  }

  const pad = n => String(n).padStart(2, '0');
  cdDays.textContent  = Math.floor(diff / 86400000);
  cdHours.textContent = pad(Math.floor((diff % 86400000) / 3600000));
  cdMins.textContent  = pad(Math.floor((diff % 3600000)  / 60000));
  cdSecs.textContent  = pad(Math.floor((diff % 60000)    / 1000));
}

/* ============================================================
   SCROLL PROGRESS + ACTIVE NAV LINKS
   ============================================================ */
function updateScrollProgress() {
  const bar = document.getElementById('nav-progress-bar');
  if (!bar) return;
  const scrollTop    = window.scrollY || document.documentElement.scrollTop;
  const scrollHeight = document.documentElement.scrollHeight - document.documentElement.clientHeight;
  bar.style.width = scrollHeight > 0 ? (scrollTop / scrollHeight * 100) + '%' : '0%';
}

function updateNavActiveState() {
  const sections  = document.querySelectorAll('section[id], .countdown-bar');
  const navHeight = (document.getElementById('main-nav') || {}).offsetHeight || 72;
  let current = '';

  sections.forEach(section => {
    if (section.getBoundingClientRect().top <= navHeight + 40) current = section.id || '';
  });

  document.querySelectorAll('.nav-link').forEach(link => {
    link.classList.remove('active');
    if (link.getAttribute('href') === '#' + current) link.classList.add('active');
  });
}

/* ============================================================
   MOBILE NAV TOGGLE
   ============================================================ */
function initMobileNav() {
  const toggle  = document.getElementById('nav-toggle');
  const navMenu = document.getElementById('nav-menu');
  if (!toggle || !navMenu) return;

  toggle.addEventListener('click', () => {
    const isOpen = toggle.getAttribute('aria-expanded') === 'true';
    toggle.setAttribute('aria-expanded', String(!isOpen));
    navMenu.classList.toggle('open', !isOpen);
  });

  navMenu.querySelectorAll('.nav-link').forEach(link => {
    link.addEventListener('click', () => {
      toggle.setAttribute('aria-expanded', 'false');
      navMenu.classList.remove('open');
    });
  });

  document.addEventListener('click', e => {
    if (!toggle.contains(e.target) && !navMenu.contains(e.target)) {
      toggle.setAttribute('aria-expanded', 'false');
      navMenu.classList.remove('open');
    }
  });
}

/* ============================================================
   ATTENDEE STATS
   ============================================================ */
async function loadAttendeeStats() {
  const stats = await RegistrationService.getStats();
  const confirmed = document.getElementById('stat-confirmed');
  const countries = document.getElementById('stat-countries');
  if (confirmed) confirmed.textContent = stats.confirmed > 0 ? stats.confirmed : '—';
  if (countries) countries.textContent = stats.countries > 0 ? stats.countries : '—';
}

/* ============================================================
   INLINE FIELD VALIDATION
   ============================================================ */
function initInlineValidation() {
  Object.keys(Validator.rules).forEach(id => {
    const el = document.getElementById(id);
    if (!el) return;

    el.addEventListener('blur', () => {
      const rule  = Validator.rules[id];
      const value = el.value.trim();
      const errId = id.replace('f-', 'err-');
      let error   = '';

      if (rule.required && !value) {
        error = rule.label + ' is required.';
      } else if (rule.pattern && value && !rule.pattern.test(value)) {
        error = 'Please enter a valid ' + rule.label.toLowerCase() + '.';
      }

      Validator.setFieldError(el, errId, error);
    });

    el.addEventListener('input', () => {
      if (el.classList.contains('invalid')) {
        el.classList.remove('invalid');
        const errEl = document.getElementById(id.replace('f-', 'err-'));
        if (errEl) errEl.textContent = '';
      }
    });
  });
}

/* ============================================================
   GATE — Enter key support
   ============================================================ */
function initGateKeyboard() {
  const gateInput = document.getElementById('gate-email');
  if (gateInput) {
    gateInput.addEventListener('keydown', e => {
      if (e.key === 'Enter') handleEmailGate();
    });
  }
}

/* ============================================================
   ADMIN AUTH SERVICE
   ============================================================ */
const AdminAuth = {

  async signIn(email, password) {
    const response = await fetch(CONFIG.SUPABASE_URL + '/auth/v1/token?grant_type=password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'apikey': CONFIG.SUPABASE_ANON_KEY },
      body: JSON.stringify({ email, password }),
    });
    const data = await response.json();
    if (!response.ok) {
      throw new Error(data.error_description || data.message || 'Invalid email or password.');
    }
    const token = data.access_token || data?.session?.access_token;
    if (!token) throw new Error('Authentication succeeded but no token was returned.');
    return token;
  },

  async signOut(token) {
    try {
      await fetch(CONFIG.SUPABASE_URL + '/auth/v1/logout', {
        method: 'POST',
        headers: { 'apikey': CONFIG.SUPABASE_ANON_KEY, 'Authorization': 'Bearer ' + token },
      });
    } catch { /* silent */ }
  },
};

let adminAccessToken  = null;
let adminRegistrations = [];

async function adminLogin() {
  const email    = document.getElementById('admin-email')?.value.trim();
  const password = document.getElementById('admin-password')?.value;
  const errEl    = document.getElementById('admin-login-error');
  const btn      = document.querySelector('#admin-login .btn-primary');

  if (!email || !password) {
    if (errEl) errEl.textContent = 'Please enter your email and password.';
    return;
  }

  if (btn) { btn.disabled = true; btn.textContent = 'Signing in…'; }
  if (errEl) errEl.textContent = '';

  try {
    adminAccessToken = await AdminAuth.signIn(email, password);
    document.getElementById('admin-login').setAttribute('hidden', '');
    document.getElementById('admin-content').removeAttribute('hidden');
    await loadAdminData();
  } catch (err) {
    if (errEl) errEl.textContent = err.message || 'Invalid email or password.';
    adminAccessToken = null;
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = 'Sign in'; }
  }
}

async function loadAdminData() {
  const tbody = document.getElementById('admin-tbody');
  if (tbody) tbody.innerHTML = '<tr><td colspan="9" class="admin-loading">Loading registrations…</td></tr>';

  try {
    const response = await fetch(
      CONFIG.SUPABASE_URL + '/rest/v1/registrations?select=*&order=created_at.desc',
      { headers: { 'apikey': CONFIG.SUPABASE_ANON_KEY, 'Authorization': 'Bearer ' + adminAccessToken } }
    );
    if (!response.ok) throw new Error('Failed to load registrations.');
    adminRegistrations = await response.json();
  } catch {
    adminRegistrations = [];
    if (tbody) tbody.innerHTML = '<tr><td colspan="9" class="admin-loading">Error loading data. Please try again.</td></tr>';
    return;
  }

  renderAdminTable(adminRegistrations);
  populateCountryFilter(adminRegistrations);
  const total = document.getElementById('admin-total');
  if (total) total.textContent = adminRegistrations.length;
}

async function openAdmin() {
  const panel = document.getElementById('admin-panel');
  if (!panel) return;
  panel.hidden = false;
  document.body.style.overflow = 'hidden';
  document.getElementById('admin-login').removeAttribute('hidden');
  document.getElementById('admin-content').setAttribute('hidden', '');
  adminAccessToken = null;
  ['admin-email','admin-password'].forEach(id => { const el = document.getElementById(id); if (el) el.value = ''; });
  const errEl = document.getElementById('admin-login-error');
  if (errEl) errEl.textContent = '';
}

async function closeAdmin() {
  const panel = document.getElementById('admin-panel');
  if (panel) panel.hidden = true;
  document.body.style.overflow = '';
  if (adminAccessToken) { AdminAuth.signOut(adminAccessToken).catch(() => {}); adminAccessToken = null; }
  adminRegistrations = [];
}

function populateCountryFilter(rows) {
  const sel = document.getElementById('admin-filter-country');
  if (!sel) return;
  const countries = [...new Set(rows.map(r => r.country_of_residence).filter(Boolean))].sort();
  sel.innerHTML = '<option value="">All countries</option>' +
    countries.map(c => `<option value="${escHtml(c)}">${escHtml(c)}</option>`).join('');
}

function filterAdmin() {
  const nameQ    = (document.getElementById('admin-search-name')?.value  || '').toLowerCase();
  const emailQ   = (document.getElementById('admin-search-email')?.value || '').toLowerCase();
  const countryQ = (document.getElementById('admin-filter-country')?.value || '').toLowerCase();
  const visaQ    = (document.getElementById('admin-filter-visa')?.value   || '').toLowerCase();

  const filtered = adminRegistrations.filter(r =>
    (!nameQ    || (r.full_name  || '').toLowerCase().includes(nameQ))    &&
    (!emailQ   || (r.work_email || '').toLowerCase().includes(emailQ))   &&
    (!countryQ || (r.country_of_residence || '').toLowerCase().includes(countryQ)) &&
    (!visaQ    || (r.visa_status || '').toLowerCase() === visaQ)
  );

  renderAdminTable(filtered);
}

function renderAdminTable(rows) {
  const tbody   = document.getElementById('admin-tbody');
  const countEl = document.getElementById('admin-count');
  if (!tbody) return;
  if (countEl) countEl.textContent = rows.length;

  if (rows.length === 0) {
    tbody.innerHTML = '<tr><td colspan="9" class="admin-loading">No registrations found.</td></tr>';
    return;
  }

  tbody.innerHTML = rows.map(r => {
    const submitted = r.created_at
      ? new Date(r.created_at).toLocaleDateString('en-GB', { day:'2-digit', month:'short', year:'numeric', hour:'2-digit', minute:'2-digit' })
      : '—';
    const statusBadge = r.flight_info_pending
      ? '<span style="font-size:0.7rem;background:#FEF3C7;color:#92400E;padding:0.1rem 0.4rem;border-radius:4px;font-weight:600">Flight pending</span>'
      : '<span style="font-size:0.7rem;background:#D1FAE5;color:#065F46;padding:0.1rem 0.4rem;border-radius:4px;font-weight:600">Complete</span>';
    return `<tr>
      <td>${escHtml(r.full_name    || '—')}</td>
      <td>${escHtml(r.work_email   || '—')}</td>
      <td>${escHtml(r.job_title    || '—')}</td>
      <td>${escHtml(r.business_unit || '—')}</td>
      <td>${escHtml(r.country_of_residence || '—')}</td>
      <td>${escHtml(r.visa_status  || '—')}</td>
      <td>${statusBadge}</td>
      <td>${escHtml(r.tshirt_size  || '—')}</td>
      <td>${submitted}</td>
    </tr>`;
  }).join('');
}

function escHtml(str) {
  return String(str)
    .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function exportCSV() {
  if (adminRegistrations.length === 0) { alert('No registrations to export.'); return; }

  const columns = [
    'full_name','work_email','gender','whatsapp_number',
    'job_title','business_unit','office_location','office_country',
    'country_of_residence','departure_city','visa_status',
    'yellow_fever_certificate_required','arrival_datetime','departure_datetime',
    'flight_info_pending','airport_transfer_arrival','airport_transfer_departure',
    'dietary_restrictions','food_allergies','dietary_notes',
    'medical_conditions','medications','carries_epipen',
    'emergency_contact_name','emergency_contact_relationship','emergency_contact_phone',
    'travel_insurance_confirmed','mobility_requirements','accessibility_requirements',
    'preferred_topics','tshirt_size','tshirt_fit',
    'registration_status','attendance_status',
    'privacy_policy_accepted','terms_accepted','created_at',
  ];

  const header = columns.map(c => '"' + c + '"').join(',');
  const rows   = adminRegistrations.map(r =>
    columns.map(c => '"' + String(r[c] ?? '').replace(/"/g, '""') + '"').join(',')
  );

  const blob = new Blob([[header, ...rows].join('\r\n')], { type: 'text/csv;charset=utf-8;' });
  const a    = Object.assign(document.createElement('a'), { href: URL.createObjectURL(blob), download: 'dgc2026-registrations.csv' });
  a.click();
  URL.revokeObjectURL(a.href);
}

/* ============================================================
   KEYBOARD SHORTCUTS
   ============================================================ */
document.addEventListener('keydown', e => {
  if (e.key === 'Escape') {
    const panel = document.getElementById('admin-panel');
    if (panel && !panel.hidden) closeAdmin();
  }
  if (e.key === 'Enter') {
    const login = document.getElementById('admin-login');
    if (login && !login.hidden) adminLogin();
  }
});

/* ============================================================
   COUNTRY AUTOCOMPLETE
   ============================================================ */
const COUNTRIES = [
  'Afghanistan','Albania','Algeria','Andorra','Angola','Antigua and Barbuda','Argentina','Armenia',
  'Australia','Austria','Azerbaijan','Bahamas','Bahrain','Bangladesh','Barbados','Belarus','Belgium',
  'Belize','Benin','Bhutan','Bolivia','Bosnia and Herzegovina','Botswana','Brazil','Brunei',
  'Bulgaria','Burkina Faso','Burundi','Cabo Verde','Cambodia','Cameroon','Canada',
  'Central African Republic','Chad','Chile','China','Colombia','Comoros','Congo',
  'Democratic Republic of the Congo','Costa Rica','Croatia','Cuba','Cyprus','Czech Republic',
  'Denmark','Djibouti','Dominica','Dominican Republic','Ecuador','Egypt','El Salvador',
  'Equatorial Guinea','Eritrea','Estonia','Eswatini','Ethiopia','Fiji','Finland','France','Gabon',
  'Gambia','Georgia','Germany','Ghana','Greece','Grenada','Guatemala','Guinea','Guinea-Bissau',
  'Guyana','Haiti','Honduras','Hungary','Iceland','India','Indonesia','Iran','Iraq','Ireland',
  'Israel','Italy','Jamaica','Japan','Jordan','Kazakhstan','Kenya','Kiribati','Kuwait','Kyrgyzstan',
  'Laos','Latvia','Lebanon','Lesotho','Liberia','Libya','Liechtenstein','Lithuania','Luxembourg',
  'Madagascar','Malawi','Malaysia','Maldives','Mali','Malta','Marshall Islands','Mauritania',
  'Mauritius','Mexico','Micronesia','Moldova','Monaco','Mongolia','Montenegro','Morocco',
  'Mozambique','Myanmar','Namibia','Nauru','Nepal','Netherlands','New Zealand','Nicaragua','Niger',
  'Nigeria','North Korea','North Macedonia','Norway','Oman','Pakistan','Palau','Palestine','Panama',
  'Papua New Guinea','Paraguay','Peru','Philippines','Poland','Portugal','Qatar','Romania','Russia',
  'Rwanda','Saint Kitts and Nevis','Saint Lucia','Saint Vincent and the Grenadines','Samoa',
  'San Marino','Sao Tome and Principe','Saudi Arabia','Senegal','Serbia','Seychelles',
  'Sierra Leone','Singapore','Slovakia','Slovenia','Solomon Islands','Somalia','South Africa',
  'South Korea','South Sudan','Spain','Sri Lanka','Sudan','Suriname','Sweden','Switzerland',
  'Syria','Taiwan','Tajikistan','Tanzania','Thailand','Timor-Leste','Togo','Tonga',
  'Trinidad and Tobago','Tunisia','Turkey','Turkmenistan','Tuvalu','Uganda','Ukraine',
  'United Arab Emirates','United Kingdom','United States','Uruguay','Uzbekistan','Vanuatu',
  'Vatican City','Venezuela','Vietnam','Yemen','Zambia','Zimbabwe',
];

let countryActiveIndex = -1;

function countryFilter(input) {
  const list = document.getElementById(input.getAttribute('aria-controls'));
  if (!list) return;

  const query   = input.value.trim().toLowerCase();
  const matches = query.length === 0
    ? COUNTRIES
    : COUNTRIES.filter(c => c.toLowerCase().includes(query));

  countryActiveIndex = -1;

  list.innerHTML = matches.length === 0
    ? '<li class="no-results">No countries found</li>'
    : matches.map(c => `<li role="option" aria-selected="false" onmousedown="countrySelect(event,'${input.id}','${c}')">${c}</li>`).join('');

  list.removeAttribute('hidden');
  input.setAttribute('aria-expanded', 'true');
}

function countrySelect(event, inputId, value) {
  event.preventDefault();
  const input = document.getElementById(inputId);
  if (!input) return;
  input.value = value;
  const list = document.getElementById(input.getAttribute('aria-controls'));
  if (list) list.setAttribute('hidden', '');
  input.setAttribute('aria-expanded', 'false');
  input.classList.remove('invalid');
  const errEl = document.getElementById(input.id.replace('f-', 'err-'));
  if (errEl) errEl.textContent = '';
}

function countryBlur(input) {
  setTimeout(() => {
    const list = document.getElementById(input.getAttribute('aria-controls'));
    if (list) list.setAttribute('hidden', '');
    input.setAttribute('aria-expanded', 'false');
    countryActiveIndex = -1;
    const val = input.value.trim();
    if (val && !COUNTRIES.includes(val)) input.value = '';
  }, 150);
}

function countryKey(event, input) {
  const list = document.getElementById(input.getAttribute('aria-controls'));
  if (!list || list.hidden) return;

  const items = list.querySelectorAll('li:not(.no-results)');
  if (!items.length) return;

  if (event.key === 'ArrowDown') {
    event.preventDefault();
    countryActiveIndex = Math.min(countryActiveIndex + 1, items.length - 1);
  } else if (event.key === 'ArrowUp') {
    event.preventDefault();
    countryActiveIndex = Math.max(countryActiveIndex - 1, 0);
  } else if (event.key === 'Enter' && countryActiveIndex >= 0) {
    event.preventDefault();
    countrySelect(event, input.id, items[countryActiveIndex].textContent);
    return;
  } else if (event.key === 'Escape') {
    list.setAttribute('hidden', '');
    input.setAttribute('aria-expanded', 'false');
    return;
  }

  items.forEach((item, i) => item.setAttribute('aria-selected', i === countryActiveIndex ? 'true' : 'false'));
  if (countryActiveIndex >= 0) items[countryActiveIndex].scrollIntoView({ block: 'nearest' });
}

/* ============================================================
   INIT
   ============================================================ */
document.addEventListener('DOMContentLoaded', () => {
  window.addEventListener('beforeunload', () => FormState.clearDraft());

  FormState.loadDraft();

  updateCountdown();
  setInterval(updateCountdown, 1000);

  const onScroll = () => { updateScrollProgress(); updateNavActiveState(); };
  window.addEventListener('scroll', onScroll, { passive: true });
  onScroll();

  initMobileNav();
  initInlineValidation();
  initGateKeyboard();
  loadAttendeeStats();

  // Programme tab default
  const firstTab = document.querySelector('.day-tab.active');
  if (firstTab) {
    const id = firstTab.getAttribute('aria-controls')?.replace('day-', '');
    if (id) showDay({ currentTarget: firstTab }, id);
  }

  // Admin panel URL trigger
  if (new URLSearchParams(window.location.search).get('admin') === 'true') openAdmin();
});
