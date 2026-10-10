-- Lookup values the app expects. Keep in sync with client/src/constants.js and
-- DEFAULT_RESOURCES in client/components/dashboard/Dashboard.jsx.

INSERT IGNORE INTO departments (name) VALUES
    ('Emergency'), ('Trauma'), ('General Surgery'), ('General Medicine'), ('Orthopedics'),
    ('Dermatology'), ('Cardiology'), ('Urology'), ('Nephrology'), ('Neurology'),
    ('Neurosurgery'), ('Ophthalmology'), ('ENT');

INSERT IGNORE INTO resource_types (name) VALUES
    ('Beds'), ('ICU'), ('Ventilators');
