/**
 * Datamine Global Conference 2026 — app.js
 * Version 2
 *
 * Architecture: clean service layer, Supabase REST backend.
 * 10-step multi-form with in-memory auto-save.
 * Hidden admin panel activated via ?admin=true
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
  TOTAL_STEPS:       10,
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
          'Content-Type':  'application/json',
          'apikey':        CONFIG.SUPABASE_ANON_KEY,
          'Authorization': 'Bearer ' + CONFIG.SUPABASE_ANON_KEY,
          'Prefer':        'return=minimal',
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
        error: 'Submission failed (HTTP ' + response.status + '). Please try again or contact anton.clowes@vigsw.com.',
      };

    } catch (err) {
      console.error('[RegistrationService] Network error:', err);
      return {
        success: false,
        error: !navigator.onLine
          ? 'You appear to be offline. Please check your connection and try again.'
          : 'Could not reach the registration service. Please try again or contact anton.clowes@vigsw.com.',
      };
    }
  },

  async getStats() {
    try {
      const response = await fetch(CONFIG.SUPABASE_URL + '/rest/v1/rpc/get_registration_stats', {
        method: 'POST',
        headers: {
          'Content-Type':  'application/json',
          'apikey':        CONFIG.SUPABASE_ANON_KEY,
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

  async getAll() {
    try {
      const response = await fetch(
        CONFIG.SUPABASE_URL + '/rest/v1/registrations?select=*&order=submitted_at.desc',
        {
          headers: {
            'apikey':        CONFIG.SUPABASE_ANON_KEY,
            'Authorization': 'Bearer ' + CONFIG.SUPABASE_ANON_KEY,
          },
        }
      );
      if (!response.ok) return [];
      return await response.json();
    } catch {
      return [];
    }
  },

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

  _saveDraft() {
    try {
      sessionStorage.setItem(this.draftKey, JSON.stringify(this.data));
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

    const email = (this.data.email || '').trim().toLowerCase().replace(/\s+/g, '');

    // preferred_topics is TEXT (not array) per Supabase schema
    const preferredTopics = orNull(this.data.preferredTopics);

    return {
      // Personal
      full_name:                     sanitise(this.data.fullName       || ''),
      email,
      whatsapp_number:               orNull(this.data.whatsappNumber),

      // Professional
      job_title:                     orNull(this.data.jobTitle),
      business_unit:                 orNull(this.data.businessUnit),
      office_location:               orNull(this.data.officeLocation),
      office_country:                orNull(this.data.officeCountry),

      // Travel
      country_of_residence:          orNull(this.data.countryOfResidence),
      departure_city:                orNull(this.data.departureCity),
      visa_required:                 orNull(this.data.visaRequired),
      yellow_fever_required:         orNull(this.data.yellowFeverRequired),
      arrival_date:                  orNull(this.data.arrivalDate),
      arrival_time:                  orNull(this.data.arrivalTime),
      departure_date:                orNull(this.data.departureDate),
      departure_time:                orNull(this.data.departureTime),

      // Transfers
      airport_transfer_arrival:      orNull(this.data.airportTransferArrival),
      airport_transfer_departure:    orNull(this.data.airportTransferDeparture),

      // Dietary
      dietary_restrictions:          orNull(this.data.dietaryRestrictions),
      food_allergies:                orNull(this.data.foodAllergies),
      dietary_notes:                 orNull(this.data.dietaryNotes),

      // Health & emergency
      medical_conditions:            orNull(this.data.medicalConditions),
      medications:                   orNull(this.data.medications),
      carries_epipen:                orNull(this.data.carriesEpipen),
      emergency_contact_name:        orNull(this.data.emergencyContactName),
      emergency_contact_relationship: orNull(this.data.emergencyContactRelationship),
      emergency_contact_phone:       orNull(this.data.emergencyContactPhone),
      travel_insurance:              orNull(this.data.travelInsurance),

      // Accessibility
      mobility_requirements:         orNull(this.data.mobilityRequirements),
      accessibility_requirements:    orNull(this.data.accessibilityRequirements),

      // Programme — TEXT not array
      preferred_topics:              preferredTopics,

      // Merchandise
      tshirt_size:                   orNull(this.data.tshirtSize),

      // Consent
      privacy_accepted:              this.data.privacyAccepted === true || this.data.privacyAccepted === 'true',
      terms_accepted:                this.data.termsAccepted === true || this.data.termsAccepted === 'true',

      submitted_at: new Date().toISOString(),
    };
  },
};

/* ============================================================
   FORM VALIDATION
   ============================================================ */
const Validator = {
  rules: {
    'f-fullname':      { required: true,  label: 'Full name' },
    'f-email':         { required: true,  label: 'Work email', pattern: /^[^\s@]+@[^\s@]+\.[^\s@]+$/ },
    'f-jobtitle':      { required: true,  label: 'Job title' },
    'f-businessunit':  { required: true,  label: 'Business unit' },
    'f-residencecountry': { required: true, label: 'Country of residence' },
    'f-emergencyname': { required: true,  label: 'Emergency contact name' },
    'f-emergencyphone':{ required: true,  label: 'Emergency contact phone' },
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

    // Required inputs/selects/textareas
    const fields = stepEl.querySelectorAll('[required]');
    fields.forEach(field => {
      const value = field.value.trim();
      const rule  = this.rules[field.id];
      const errId = field.id.replace('f-', 'err-');
      let error   = '';

      if (!value) {
        error = (rule ? rule.label : field.name) + ' is required.';
      } else if (rule && rule.pattern && !rule.pattern.test(value)) {
        error = 'Please enter a valid ' + rule.label.toLowerCase() + '.';
      }

      this.setFieldError(field, errId, error);
      if (error) valid = false;
    });

    // Step 9: t-shirt size
    if (step === 9) {
      const selected = document.querySelector('input[name="tshirtSize"]:checked');
      const errEl = document.getElementById('err-tshirt');
      if (!selected) {
        if (errEl) errEl.textContent = 'Please select a t-shirt size.';
        valid = false;
      } else {
        if (errEl) errEl.textContent = '';
      }
    }

    // Step 10: consent checkboxes
    if (step === 10) {
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
  const inputs   = stepEl.querySelectorAll('input:not([type="radio"]):not([type="checkbox"])');
  const selects  = stepEl.querySelectorAll('select');
  const textareas = stepEl.querySelectorAll('textarea');
  const radios   = {};

  // Collect radio values
  stepEl.querySelectorAll('input[type="radio"]:checked').forEach(r => {
    radios[r.name] = r.value;
  });

  // Collect checkboxes
  stepEl.querySelectorAll('input[type="checkbox"]').forEach(cb => {
    data[toCamel(cb.name)] = cb.checked;
  });

  inputs.forEach(el => {
    if (el.name) data[toCamel(el.name)] = el.value;
  });

  selects.forEach(el => {
    if (el.name) data[toCamel(el.name)] = el.value;
  });

  textareas.forEach(el => {
    if (el.name) data[toCamel(el.name)] = el.value;
  });

  Object.assign(data, radios);

  return data;
}

function toCamel(str) {
  return str.replace(/-./g, x => x[1].toUpperCase())
            .replace(/_./g, x => x[1].toUpperCase());
}

/* ============================================================
   MULTI-STEP NAVIGATION
   ============================================================ */
function nextStep(current) {
  if (!Validator.validateStep(current)) {
    // Shake the step
    const panel = document.getElementById('form-step-' + current);
    if (panel) {
      panel.style.animation = 'none';
      setTimeout(() => {
        panel.style.animation = '';
      }, 10);
    }
    return;
  }

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
  if (toEl)   toEl.hidden = false;

  FormState.currentStep = to;
  updateStepIndicator(to);

  // Scroll to form top
  const formWrap = document.getElementById('reg-form-wrap');
  if (formWrap) {
    const top = formWrap.getBoundingClientRect().top + window.scrollY - (72 + 20);
    window.scrollTo({ top, behavior: 'smooth' });
  }
}

function updateStepIndicator(current) {
  document.querySelectorAll('.form-step-item').forEach(item => {
    const step = parseInt(item.dataset.step, 10);
    item.classList.remove('active', 'completed');
    if (step === current) {
      item.classList.add('active');
    } else if (step < current) {
      item.classList.add('completed');
      // Update dot to checkmark
      const dot = item.querySelector('.form-step-dot');
      if (dot && dot.textContent !== '✓') {
        dot.textContent = '✓';
      }
    }
  });
}

/* ============================================================
   FORM SUBMISSION
   ============================================================ */
async function submitRegistration() {
  if (!Validator.validateStep(10)) return;

  FormState.merge(collectStepData(10));

  const submitBtn   = document.getElementById('submit-btn');
  const btnLabel    = submitBtn.querySelector('.btn-label');
  const btnLoading  = submitBtn.querySelector('.btn-loading');
  const errorBox    = document.getElementById('error-box');
  const errorMsg    = document.getElementById('error-message');

  // Set loading state
  submitBtn.disabled = true;
  if (btnLabel)   btnLabel.hidden   = true;
  if (btnLoading) btnLoading.hidden = false;
  if (errorBox)   errorBox.hidden   = true;

  const payload = FormState.buildPayload();
  const result  = await RegistrationService.submit(payload);

  if (result.success) {
    FormState.clearDraft();
    document.getElementById('reg-form-wrap').hidden = true;
    document.getElementById('success-box').hidden   = false;
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
   PROGRAMME TAB SWITCHER
   ============================================================ */
function showDay(event, dayId) {
  // Deactivate all tabs
  document.querySelectorAll('.day-tab').forEach(tab => {
    tab.classList.remove('active');
    tab.setAttribute('aria-selected', 'false');
  });

  // Hide all content panels
  document.querySelectorAll('.day-content').forEach(panel => {
    panel.classList.remove('active');
    panel.hidden = true;
  });

  // Activate clicked tab
  if (event && event.currentTarget) {
    event.currentTarget.classList.add('active');
    event.currentTarget.setAttribute('aria-selected', 'true');
  }

  // Show matching content
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
  const isOpen  = btn.getAttribute('aria-expanded') === 'true';
  const answer  = btn.nextElementSibling;

  // Close all others
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
    cdDays.textContent = '0';
    cdHours.textContent = '0';
    cdMins.textContent = '0';
    cdSecs.textContent = '0';
    return;
  }

  const pad = n => String(n).padStart(2, '0');
  const days  = Math.floor(diff / 86400000);
  const hours = Math.floor((diff % 86400000) / 3600000);
  const mins  = Math.floor((diff % 3600000)  / 60000);
  const secs  = Math.floor((diff % 60000)    / 1000);

  cdDays.textContent  = days;
  cdHours.textContent = pad(hours);
  cdMins.textContent  = pad(mins);
  cdSecs.textContent  = pad(secs);
}

/* ============================================================
   SCROLL PROGRESS + ACTIVE NAV LINKS
   ============================================================ */
function updateScrollProgress() {
  const bar = document.getElementById('nav-progress-bar');
  if (!bar) return;
  const scrollTop = window.scrollY || document.documentElement.scrollTop;
  const scrollHeight = document.documentElement.scrollHeight - document.documentElement.clientHeight;
  bar.style.width = scrollHeight > 0 ? (scrollTop / scrollHeight * 100) + '%' : '0%';
}

function updateNavActiveState() {
  const sections = document.querySelectorAll('section[id], .countdown-bar');
  const nav      = document.getElementById('main-nav');
  const navHeight = nav ? nav.offsetHeight : 72;

  let current = '';

  sections.forEach(section => {
    const top = section.getBoundingClientRect().top;
    if (top <= navHeight + 40) current = section.id || '';
  });

  document.querySelectorAll('.nav-link').forEach(link => {
    link.classList.remove('active');
    const href = link.getAttribute('href');
    if (href && href === '#' + current) {
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
      const rule   = Validator.rules[id];
      const value  = el.value.trim();
      const errId  = id.replace('f-', 'err-');
      let error    = '';

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
   ADMIN PANEL
   ============================================================ */
let adminRegistrations = [];

async function openAdmin() {
  const panel = document.getElementById('admin-panel');
  if (!panel) return;
  panel.hidden = false;
  document.body.style.overflow = 'hidden';

  const tbody = document.getElementById('admin-tbody');
  if (tbody) tbody.innerHTML = '<tr><td colspan="8" class="admin-loading">Loading registrations…</td></tr>';

  adminRegistrations = await RegistrationService.getAll();
  renderAdminTable(adminRegistrations);
  populateCountryFilter(adminRegistrations);

  const total = document.getElementById('admin-total');
  if (total) total.textContent = adminRegistrations.length;
}

function closeAdmin() {
  const panel = document.getElementById('admin-panel');
  if (panel) panel.hidden = true;
  document.body.style.overflow = '';
}

function populateCountryFilter(rows) {
  const sel = document.getElementById('admin-filter-country');
  if (!sel) return;
  const countries = [...new Set(rows.map(r => r.country_of_residence).filter(Boolean))].sort();
  sel.innerHTML = '<option value="">All countries</option>';
  countries.forEach(c => {
    const opt = document.createElement('option');
    opt.value = c;
    opt.textContent = c;
    sel.appendChild(opt);
  });
}

function filterAdmin() {
  const nameQ    = (document.getElementById('admin-search-name')?.value   || '').toLowerCase();
  const emailQ   = (document.getElementById('admin-search-email')?.value  || '').toLowerCase();
  const countryQ = (document.getElementById('admin-filter-country')?.value || '').toLowerCase();
  const visaQ    = (document.getElementById('admin-filter-visa')?.value    || '').toLowerCase();

  const filtered = adminRegistrations.filter(r => {
    const name  = (r.full_name  || '').toLowerCase();
    const email = (r.email      || '').toLowerCase();
    const country = (r.country_of_residence || '').toLowerCase();
    const visa    = (r.visa_required || '').toLowerCase();

    return (
      (!nameQ    || name.includes(nameQ))    &&
      (!emailQ   || email.includes(emailQ))  &&
      (!countryQ || country.includes(countryQ)) &&
      (!visaQ    || visa === visaQ)
    );
  });

  renderAdminTable(filtered);
}

function renderAdminTable(rows) {
  const tbody = document.getElementById('admin-tbody');
  const countEl = document.getElementById('admin-count');
  if (!tbody) return;

  if (countEl) countEl.textContent = rows.length;

  if (rows.length === 0) {
    tbody.innerHTML = '<tr><td colspan="8" class="admin-loading">No registrations found.</td></tr>';
    return;
  }

  tbody.innerHTML = rows.map(r => {
    const submitted = r.submitted_at
      ? new Date(r.submitted_at).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
      : '—';
    return `<tr>
      <td>${escHtml(r.full_name || '—')}</td>
      <td>${escHtml(r.email || '—')}</td>
      <td>${escHtml(r.job_title || '—')}</td>
      <td>${escHtml(r.business_unit || '—')}</td>
      <td>${escHtml(r.country_of_residence || '—')}</td>
      <td>${escHtml(r.visa_required || '—')}</td>
      <td>${escHtml(r.tshirt_size || '—')}</td>
      <td>${submitted}</td>
    </tr>`;
  }).join('');
}

function escHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function exportCSV() {
  if (adminRegistrations.length === 0) {
    alert('No registrations to export.');
    return;
  }

  const columns = [
    'full_name', 'email', 'whatsapp_number', 'job_title', 'business_unit',
    'office_location', 'office_country', 'country_of_residence', 'departure_city',
    'visa_required', 'yellow_fever_required', 'arrival_date', 'arrival_time',
    'departure_date', 'departure_time', 'airport_transfer_arrival',
    'airport_transfer_departure', 'dietary_restrictions', 'food_allergies',
    'dietary_notes', 'medical_conditions', 'medications', 'carries_epipen',
    'emergency_contact_name', 'emergency_contact_relationship', 'emergency_contact_phone',
    'travel_insurance', 'mobility_requirements', 'accessibility_requirements',
    'preferred_topics', 'tshirt_size', 'privacy_accepted', 'terms_accepted', 'submitted_at',
  ];

  const header = columns.map(c => '"' + c + '"').join(',');
  const rows   = adminRegistrations.map(r =>
    columns.map(c => {
      const val = r[c];
      if (val === null || val === undefined) return '';
      return '"' + String(val).replace(/"/g, '""') + '"';
    }).join(',')
  );

  const csv   = [header, ...rows].join('\r\n');
  const blob  = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url   = URL.createObjectURL(blob);
  const link  = document.createElement('a');
  link.href   = url;
  link.download = 'datamine-conference-2026-registrations.csv';
  link.click();
  URL.revokeObjectURL(url);
}

/* ============================================================
   KEYBOARD SHORTCUT — ESC closes admin
   ============================================================ */
document.addEventListener('keydown', e => {
  if (e.key === 'Escape') {
    const panel = document.getElementById('admin-panel');
    if (panel && !panel.hidden) closeAdmin();
  }
});

/* ============================================================
   INIT
   ============================================================ */
document.addEventListener('DOMContentLoaded', () => {
  // Restore draft
  FormState.loadDraft();

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

  // Stats
  loadAttendeeStats();

  // Programme tab default
  const firstTab = document.querySelector('.day-tab.active');
  if (firstTab) {
    const id = firstTab.getAttribute('aria-controls')?.replace('day-', '');
    if (id) showDay({ currentTarget: firstTab }, id);
  }

  // Admin panel URL trigger
  if (new URLSearchParams(window.location.search).get('admin') === 'true') {
    openAdmin();
  }
});
