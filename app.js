/**
 * Datamine Offsite 2027 — app.js
 *
 * Architecture: clean service layer, no browser storage.
 * Registration submits via Supabase REST API.
 *
 * @see docs/POWER_AUTOMATE_SETUP.md for flow configuration
 * @see docs/ADMIN_DASHBOARD.md for SharePoint admin operations
 */

'use strict';

/* ============================================================
   CONFIG
   ============================================================ */
const CONFIG = {
  SUPABASE_URL: 'https://aishopxdeetglbmxsjad.supabase.co',
  SUPABASE_ANON_KEY: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFpc2hvcHhkZWV0Z2xibXhzamFkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODEwNDE5MTEsImV4cCI6MjA5NjYxNzkxMX0._XQ3C8ZV32OO1tMS3Bm-tGYWm8zaFtSscraUg60uNdU',
  EVENT_DATE: new Date('2026-11-22T18:00:00'),
  FORM_STEPS: 4,
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
          'Content-Type': 'application/json',
          'apikey': CONFIG.SUPABASE_ANON_KEY,
          'Authorization': 'Bearer ' + CONFIG.SUPABASE_ANON_KEY,
          'Prefer': 'return=minimal',
        },
        body: JSON.stringify(payload),
      });

      if (response.status === 201 || response.status === 200) {
        return { success: true };
      }

      if (response.status === 409) {
        return {
          success: false,
          error: 'This email address has already been registered. Contact anton.clowes@vigsw.com if you need to update your details.',
        };
      }

      const body = await response.text().catch(() => '');
      console.error('[RegistrationService] HTTP ' + response.status, body);
      return {
        success: false,
        error: 'Submission failed (status ' + response.status + '). Please try again or email anton.clowes@vigsw.com.',
      };

    } catch (err) {
      console.error('[RegistrationService] Network error:', err);
      return {
        success: false,
        error: !navigator.onLine
          ? 'You appear to be offline. Please check your connection and try again.'
          : 'Could not reach the registration service. Please try again or email anton.clowes@vigsw.com.',
      };
    }
  },

  async getStats() {
    try {
      const response = await fetch(CONFIG.SUPABASE_URL + '/rest/v1/rpc/get_registration_stats', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'apikey': CONFIG.SUPABASE_ANON_KEY,
          'Authorization': 'Bearer ' + CONFIG.SUPABASE_ANON_KEY,
        },
        body: JSON.stringify({}),
      });
      if (!response.ok) return { confirmed: 0, countries: 0, teams: 0 };
      return await response.json();
    } catch {
      return { confirmed: 0, countries: 0, teams: 0 };
    }
  },

};

/* ============================================================
   FORM STATE — in-memory only, no browser storage
   ============================================================ */
const FormState = {
  currentStep: 1,
  data: {},

  merge(stepData) {
    this.data = { ...this.data, ...stepData };
  },

  buildPayload() {
    const sanitise = val => (typeof val === 'string' ? val.trim().replace(/[<>]/g, '') : val);

    const workshops = Array.from(
      document.querySelectorAll('input[name="workshops"]:checked')
    ).map(cb => cb.value);

    const orNull = val => {
      if (val === null || val === undefined) return null;
      const s = String(val).trim();
      return s === '' ? null : s;
    };

    return {
      first_name:               sanitise(this.data.firstName   || ''),
      last_name:                sanitise(this.data.lastName    || ''),
      email: (this.data.email || '')
  .trim()
  .toLowerCase()
  .replace(/\s+/g, ''),
      team:                     sanitise(this.data.team         || ''),
      role:                     orNull(this.data.role),
      manager:                  orNull(this.data.manager),
      office_location:          orNull(this.data.location),
      attendance_status:        sanitise(this.data.attendance   || 'confirmed'),
      arrival_date:             orNull(this.data.arrivalDate),
      departure_date:           orNull(this.data.departureDate),
      arrival_time:             orNull(this.data.arrivalTime),
      departure_time:           orNull(this.data.departureTime),
      airline:                  orNull(this.data.airline),
      flight_number:            orNull(this.data.flightNumber),
      departure_airport:        orNull(this.data.departureAirport),
      shuttle_required:         sanitise(this.data.shuttle      || ''),
      luggage_count:            orNull(this.data.luggage),
      visa_letter_required:     sanitise(this.data.visaLetter   || ''),
      passport_nationality:     orNull(this.data.passportNationality),
      emergency_contact_name:   orNull(this.data.emergencyContactName),
      emergency_contact_phone:  orNull(this.data.emergencyContactPhone),
      emergency_contact_relation: orNull(this.data.emergencyContactRelation),
      check_in_date:            orNull(this.data.checkIn),
      check_out_date:           orNull(this.data.checkOut),
      room_type:                orNull(this.data.roomType),
      roommate_preference:      orNull(this.data.roommatePreference),
      tshirt_size:              sanitise(this.data.tshirtSize   || ''),
      dietary_requirements:     orNull(this.data.dietaryRequirements),
      accessibility_requirements: orNull(this.data.accessibilityRequirements),
      primary_interest:         orNull(this.data.primaryInterest),
      workshop_tracks:          workshops.length ? workshops : null,
      hackathon_interest:       orNull(this.data.hackathonInterest),
      expectations:             orNull(this.data.expectations),
      notes:                    orNull(this.data.notes),
      submitted_at:             new Date().toISOString(),
    };
  },
};

/* ============================================================
   FORM VALIDATION
   ============================================================ */
const Validator = {
  rules: {
    'f-fname':      { required: true, label: 'First name' },
    'f-lname':      { required: true, label: 'Last name' },
    'f-email':      { required: true, type: 'email', label: 'Email', pattern: /^[^\s@]+@[^\s@]+\.[^\s@]+$/ },
    'f-team':       { required: true, label: 'Team' },
    'f-manager':    { required: true, label: 'Manager' },
    'f-location':   { required: true, label: 'Location' },
    'f-attendance': { required: true, label: 'Attendance confirmation' },
    'f-arrival':    { required: true, label: 'Arrival date' },
    'f-departure':  { required: true, label: 'Departure date' },
  },

  validateStep(step) {
    const stepFields = {
      1: ['f-fname', 'f-lname', 'f-email', 'f-team', 'f-manager', 'f-location', 'f-attendance'],
      2: ['f-arrival', 'f-departure'],
      3: [],
      4: [],
    };

    let valid = true;
    const fields = stepFields[step] || [];

    fields.forEach(id => {
      const rule = this.rules[id];
      if (!rule) return;

      const el = document.getElementById(id);
      if (!el) return;

      const value = el.value.trim();
      let error = '';

      if (rule.required && !value) {
        error = `${rule.label} is required.`;
      } else if (rule.pattern && value && !rule.pattern.test(value)) {
        error = `Please enter a valid ${rule.label.toLowerCase()}.`;
      }

      this.setFieldError(el, id.replace('f-', 'err-'), error);
      if (error) valid = false;
    });

    return valid;
  },

  setFieldError(el, errId, message) {
    const errEl = document.getElementById(errId);
    if (message) {
      el.classList.add('invalid');
      if (errEl) errEl.textContent = message;
    } else {
      el.classList.remove('invalid');
      if (errEl) errEl.textContent = '';
    }
  },
};

/* ============================================================
   FORM STEP NAVIGATION
   ============================================================ */
function collectStepData(step) {
  const map = {
    1: ['f-fname', 'f-lname', 'f-email', 'f-team', 'f-role', 'f-manager', 'f-location', 'f-attendance'],
    2: ['f-arrival', 'f-departure', 'f-arrival-time', 'f-departure-time', 'f-airline', 'f-flight-num',
        'f-airport', 'f-shuttle', 'f-luggage', 'f-visa', 'f-passport',
        'f-emergency-name', 'f-emergency-phone', 'f-emergency-relation'],
    3: ['f-checkin', 'f-checkout', 'f-room', 'f-roommate', 'f-tshirt', 'f-dietary', 'f-access'],
    4: ['f-excited', 'f-hackathon', 'f-expectations', 'f-notes'],
  };

  const idToKey = {
    'f-fname': 'firstName', 'f-lname': 'lastName', 'f-email': 'email',
    'f-team': 'team', 'f-role': 'role', 'f-manager': 'manager',
    'f-location': 'location', 'f-attendance': 'attendance',
    'f-arrival': 'arrivalDate', 'f-departure': 'departureDate',
    'f-arrival-time': 'arrivalTime', 'f-departure-time': 'departureTime',
    'f-airline': 'airline', 'f-flight-num': 'flightNumber',
    'f-airport': 'departureAirport', 'f-shuttle': 'shuttle',
    'f-luggage': 'luggage', 'f-visa': 'visaLetter', 'f-passport': 'passportNationality',
    'f-emergency-name': 'emergencyContactName', 'f-emergency-phone': 'emergencyContactPhone',
    'f-emergency-relation': 'emergencyContactRelation',
    'f-checkin': 'checkIn', 'f-checkout': 'checkOut', 'f-room': 'roomType',
    'f-roommate': 'roommatePreference', 'f-tshirt': 'tshirtSize',
    'f-dietary': 'dietaryRequirements', 'f-access': 'accessibilityRequirements',
    'f-excited': 'primaryInterest', 'f-hackathon': 'hackathonInterest',
    'f-expectations': 'expectations', 'f-notes': 'notes',
  };

  const data = {};
  (map[step] || []).forEach(id => {
    const el = document.getElementById(id);
    if (el) data[idToKey[id]] = el.value.trim();
  });

  FormState.merge(data);
}

function showStep(stepNum) {
  const totalSteps = CONFIG.FORM_STEPS;

  for (let i = 1; i <= totalSteps; i++) {
    const panel = document.getElementById(`form-step-${i}`);
    const indicator = document.getElementById(`step-indicator-${i}`);
    const connector = indicator?.nextElementSibling;

    if (panel) {
      if (i === stepNum) {
        panel.removeAttribute('hidden');
        panel.classList.add('active');
      } else {
        panel.setAttribute('hidden', '');
        panel.classList.remove('active');
      }
    }

    if (indicator) {
      indicator.classList.remove('active', 'completed');
      if (i === stepNum) indicator.classList.add('active');
      if (i < stepNum) indicator.classList.add('completed');
    }

    if (connector && connector.classList.contains('step-connector')) {
      if (i < stepNum) {
        connector.classList.add('completed');
      } else {
        connector.classList.remove('completed');
      }
    }
  }

  FormState.currentStep = stepNum;

  const registerSection = document.getElementById('register');
  if (registerSection) {
    const offset = registerSection.getBoundingClientRect().top + window.scrollY - 80;
    window.scrollTo({ top: offset, behavior: 'smooth' });
  }

  const heading = document.querySelector(`#form-step-${stepNum} .form-step-heading`);
  if (heading) heading.focus();
}

window.nextStep = function(currentStep) {
  if (!Validator.validateStep(currentStep)) return;
  collectStepData(currentStep);
  showStep(currentStep + 1);
};

window.prevStep = function(currentStep) {
  collectStepData(currentStep);
  showStep(currentStep - 1);
};

/* ============================================================
   FORM SUBMISSION
   ============================================================ */
window.submitRegistration = async function() {
  if (!Validator.validateStep(4)) return;
  collectStepData(4);

  const submitBtn = document.getElementById('submit-btn');
  const errorBox = document.getElementById('error-box');
  const successBox = document.getElementById('success-box');
  const formWrap = document.getElementById('reg-form-wrap');

  submitBtn.classList.add('loading');
  submitBtn.disabled = true;
  errorBox.hidden = true;

  const payload = FormState.buildPayload();

  console.log('PAYLOAD FINAL', JSON.stringify(payload, null, 2));

  const result = await RegistrationService.submit(payload);

  submitBtn.classList.remove('loading');
  submitBtn.disabled = false;

  if (result.success) {
    formWrap.style.display = 'none';
    successBox.removeAttribute('hidden');
    successBox.focus();
    loadAttendeeStats();
  } else {
    document.getElementById('error-message').innerHTML =
      result.error || 'Submission failed. Please try again or email <a href="mailto:anton.clowes@vigsw.com">anton.clowes@vigsw.com</a>.';
    errorBox.removeAttribute('hidden');
    errorBox.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }
};

/* ============================================================
   AGENDA TABS
   ============================================================ */
window.showDay = function(event, id) {
  const allContent = document.querySelectorAll('.day-content');
  const allTabs = document.querySelectorAll('.day-tab');

  allContent.forEach(d => {
    d.classList.remove('active');
    d.setAttribute('hidden', '');
  });

  allTabs.forEach(t => {
    t.classList.remove('active');
    t.setAttribute('aria-selected', 'false');
  });

  const target = document.getElementById(`day-${id}`);
  if (target) {
    target.classList.add('active');
    target.removeAttribute('hidden');
  }

  event.currentTarget.classList.add('active');
  event.currentTarget.setAttribute('aria-selected', 'true');
};

/* ============================================================
   FAQ ACCORDION
   ============================================================ */
window.toggleFaq = function(btn) {
  const item = btn.parentElement;
  const answer = item.querySelector('.faq-a');
  const isOpen = item.classList.contains('open');

  document.querySelectorAll('.faq-item').forEach(i => {
    i.classList.remove('open');
    i.querySelector('.faq-q')?.setAttribute('aria-expanded', 'false');
  });

  if (!isOpen) {
    item.classList.add('open');
    btn.setAttribute('aria-expanded', 'true');
    if (answer) answer.removeAttribute('hidden');
  }
};

/* ============================================================
   COUNTDOWN
   ============================================================ */
function updateCountdown() {
  const now = new Date();
  const diff = CONFIG.EVENT_DATE - now;

  if (diff <= 0) {
    ['cd-days', 'cd-hours', 'cd-mins', 'cd-secs'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.textContent = '00';
    });
    return;
  }

  const days    = Math.floor(diff / 86400000);
  const hours   = Math.floor((diff % 86400000) / 3600000);
  const minutes = Math.floor((diff % 3600000) / 60000);
  const seconds = Math.floor((diff % 60000) / 1000);

  const pad = n => String(n).padStart(2, '0');

  const cdDays = document.getElementById('cd-days');
  const cdHrs  = document.getElementById('cd-hours');
  const cdMins = document.getElementById('cd-mins');
  const cdSecs = document.getElementById('cd-secs');

  if (cdDays) cdDays.textContent = pad(days);
  if (cdHrs)  cdHrs.textContent  = pad(hours);
  if (cdMins) cdMins.textContent = pad(minutes);
  if (cdSecs) cdSecs.textContent = pad(seconds);
}

/* ============================================================
   NEW: ANIMATED STAT COUNTERS
   Uses IntersectionObserver to trigger when stats strip is visible
   ============================================================ */
function animateCounter(el, target, suffix, duration) {
  const start = performance.now();
  const startVal = 0;

  function step(timestamp) {
    const elapsed = timestamp - start;
    const progress = Math.min(elapsed / duration, 1);
    // Ease out cubic
    const eased = 1 - Math.pow(1 - progress, 3);
    const current = Math.round(startVal + (target - startVal) * eased);
    el.textContent = current + suffix;
    if (progress < 1) requestAnimationFrame(step);
  }

  requestAnimationFrame(step);
}

function initStatCounters() {
  const statNums = document.querySelectorAll('.stat-num[data-target]');
  if (!statNums.length) return;

  const observer = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        const el = entry.target;
        const target = parseInt(el.dataset.target, 10);
        const suffix = el.dataset.suffix || '';
        animateCounter(el, target, suffix, 1200);
        observer.unobserve(el);
      }
    });
  }, { threshold: 0.3 });

  statNums.forEach(el => observer.observe(el));
}

/* ============================================================
   SCROLL PROGRESS + NAV ACTIVE STATE
   ============================================================ */
function updateScrollProgress() {
  const scrollTop  = window.scrollY;
  const docHeight  = document.documentElement.scrollHeight - window.innerHeight;
  const progress   = docHeight > 0 ? (scrollTop / docHeight) * 100 : 0;
  const bar        = document.getElementById('nav-progress-bar');
  if (bar) bar.style.width = `${Math.min(progress, 100)}%`;
}

function updateNavActiveState() {
  const sections = document.querySelectorAll('section[id]');
  const navLinks = document.querySelectorAll('.nav-link[href^="#"]');
  const scrollPos = window.scrollY + 100;

  let current = '';
  sections.forEach(section => {
    if (section.offsetTop <= scrollPos) {
      current = section.id;
    }
  });

  navLinks.forEach(link => {
    link.classList.remove('active');
    if (link.getAttribute('href') === `#${current}`) {
      link.classList.add('active');
    }
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
   ATTENDEE STATS — aggregate counts only
   ============================================================ */
async function loadAttendeeStats() {
  const stats = await RegistrationService.getStats();

  const confirmed = document.getElementById('stat-confirmed');
  const countries = document.getElementById('stat-countries');
  const teams     = document.getElementById('stat-teams');

  if (confirmed) confirmed.textContent = stats.confirmed > 0 ? stats.confirmed : '—';
  if (countries) countries.textContent = stats.countries > 0 ? stats.countries : '—';
  if (teams)     teams.textContent     = stats.teams     > 0 ? stats.teams     : '—';
}

/* ============================================================
   INLINE FORM VALIDATION ON BLUR
   ============================================================ */
function initInlineValidation() {
  Object.keys(Validator.rules).forEach(id => {
    const el = document.getElementById(id);
    if (!el) return;

    el.addEventListener('blur', () => {
      const rule = Validator.rules[id];
      const value = el.value.trim();
      let error = '';

      if (rule.required && !value) {
        error = `${rule.label} is required.`;
      } else if (rule.pattern && value && !rule.pattern.test(value)) {
        error = `Please enter a valid ${rule.label.toLowerCase()}.`;
      }

      Validator.setFieldError(el, id.replace('f-', 'err-'), error);
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
   INIT
   ============================================================ */
document.addEventListener('DOMContentLoaded', () => {
  // Countdown
  updateCountdown();
  setInterval(updateCountdown, 1000);

  // Scroll handlers
  const onScroll = () => {
    updateScrollProgress();
    updateNavActiveState();
  };

  window.addEventListener('scroll', onScroll, { passive: true });
  onScroll();

  // Mobile nav
  initMobileNav();

  // Inline validation
  initInlineValidation();

  // Animated stat counters (new section)
  initStatCounters();

  // Load attendee stats (aggregate only)
  loadAttendeeStats();

  // Ensure first agenda tab is visible
  const firstTab = document.querySelector('.day-tab.active');
  if (firstTab) {
    const id = firstTab.getAttribute('aria-controls')?.replace('day-', '');
    if (id) showDay({ currentTarget: firstTab }, id);
  }
});

/*
 * ============================================================
 * POWER AUTOMATE FLOW — SETUP CHECKLIST
 * ============================================================
 *
 * 1. In Power Automate, create a new flow:
 *    "When an HTTP request is received" trigger
 *    Method: POST
 *
 * 2. Paste this JSON schema into the trigger's "Request Body
 *    JSON Schema" field so Power Automate parses all fields:
 *
 *    {
 *      "type": "object",
 *      "properties": {
 *        "first_name":                   { "type": "string" },
 *        "last_name":                    { "type": "string" },
 *        "email":                        { "type": "string" },
 *        "team":                         { "type": "string" },
 *        "role":                         { "type": "string" },
 *        "manager":                      { "type": "string" },
 *        "office_location":              { "type": "string" },
 *        "attendance_status":            { "type": "string" },
 *        "arrival_date":                 { "type": "string" },
 *        "departure_date":               { "type": "string" },
 *        "arrival_time":                 { "type": "string" },
 *        "departure_time":               { "type": "string" },
 *        "airline":                      { "type": "string" },
 *        "flight_number":                { "type": "string" },
 *        "departure_airport":            { "type": "string" },
 *        "shuttle_required":             { "type": "string" },
 *        "luggage_count":                { "type": "string" },
 *        "visa_letter_required":         { "type": "string" },
 *        "passport_nationality":         { "type": "string" },
 *        "emergency_contact_name":       { "type": "string" },
 *        "emergency_contact_phone":      { "type": "string" },
 *        "emergency_contact_relation":   { "type": "string" },
 *        "check_in_date":                { "type": "string" },
 *        "check_out_date":               { "type": "string" },
 *        "room_type":                    { "type": "string" },
 *        "roommate_preference":          { "type": "string" },
 *        "tshirt_size":                  { "type": "string" },
 *        "dietary_requirements":         { "type": "string" },
 *        "accessibility_requirements":   { "type": "string" },
 *        "primary_interest":             { "type": "string" },
 *        "workshop_tracks":              { "type": "string" },
 *        "hackathon_interest":           { "type": "string" },
 *        "expectations":                 { "type": "string" },
 *        "notes":                        { "type": "string" },
 *        "submitted_at":                 { "type": "string" }
 *      }
 *    }
 *
 * 3. Add a "Create item" SharePoint action. Map each dynamic
 *    content token to its matching SharePoint column.
 *
 * 4. Add a "Response" action at the end:
 *    Status code: 200
 *    Body: { "status": "ok" }
 *
 * 5. Save the flow. Copy the HTTP POST URL from the trigger step.
 *
 * ============================================================
 */
