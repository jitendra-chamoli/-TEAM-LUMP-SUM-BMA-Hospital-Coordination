-- Core schema. A hospital is its own entity; admins and staff are users that belong to one.

CREATE TABLE IF NOT EXISTS hospitals (
    id          INT AUTO_INCREMENT PRIMARY KEY,
    name        VARCHAR(150) NOT NULL,
    address     VARCHAR(500) NOT NULL,
    city        VARCHAR(80)  NOT NULL,
    latitude    DECIMAL(9,6) NOT NULL,
    longitude   DECIMAL(9,6) NOT NULL,
    phone       VARCHAR(20)  NULL,
    created_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_hospitals_city (city),
    INDEX idx_hospitals_geo (latitude, longitude)
);

CREATE TABLE IF NOT EXISTS departments (
    id    SMALLINT AUTO_INCREMENT PRIMARY KEY,
    name  VARCHAR(60) NOT NULL UNIQUE
);

-- Replaces the old admins + staff_directory tables: one email, one account.
CREATE TABLE IF NOT EXISTS users (
    id             INT AUTO_INCREMENT PRIMARY KEY,
    hospital_id    INT NOT NULL,
    department_id  SMALLINT NULL,                 -- NULL for admins
    name           VARCHAR(100) NOT NULL,
    email          VARCHAR(150) NOT NULL UNIQUE,
    password_hash  VARCHAR(255) NOT NULL,
    role           ENUM('admin', 'staff') NOT NULL,
    is_active      BOOLEAN NOT NULL DEFAULT TRUE,
    created_at     TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_users_hospital   FOREIGN KEY (hospital_id)   REFERENCES hospitals(id) ON DELETE CASCADE,
    CONSTRAINT fk_users_department FOREIGN KEY (department_id) REFERENCES departments(id),
    INDEX idx_users_hospital (hospital_id)
);

CREATE TABLE IF NOT EXISTS doctors (
    id             INT AUTO_INCREMENT PRIMARY KEY,
    hospital_id    INT NOT NULL,
    department_id  SMALLINT NOT NULL,
    name           VARCHAR(100) NOT NULL,
    is_available   BOOLEAN NOT NULL DEFAULT TRUE,
    created_at     TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_doctors_hospital   FOREIGN KEY (hospital_id)   REFERENCES hospitals(id) ON DELETE CASCADE,
    CONSTRAINT fk_doctors_department FOREIGN KEY (department_id) REFERENCES departments(id),
    INDEX idx_doctors_hosp_dept (hospital_id, department_id)
);

CREATE TABLE IF NOT EXISTS resource_types (
    id    SMALLINT AUTO_INCREMENT PRIMARY KEY,
    name  VARCHAR(40) NOT NULL UNIQUE             -- Beds, ICU, Ventilators, ...
);

CREATE TABLE IF NOT EXISTS hospital_resources (
    id                INT AUTO_INCREMENT PRIMARY KEY,
    hospital_id       INT NOT NULL,
    department_id     SMALLINT NOT NULL,
    resource_type_id  SMALLINT NOT NULL,
    current_count     INT NOT NULL DEFAULT 0,
    capacity          INT NULL,
    updated_at        TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    CONSTRAINT chk_resources_count CHECK (current_count >= 0),
    CONSTRAINT uq_resources UNIQUE (hospital_id, department_id, resource_type_id),
    CONSTRAINT fk_resources_hospital   FOREIGN KEY (hospital_id)      REFERENCES hospitals(id) ON DELETE CASCADE,
    CONSTRAINT fk_resources_department FOREIGN KEY (department_id)    REFERENCES departments(id),
    CONSTRAINT fk_resources_type       FOREIGN KEY (resource_type_id) REFERENCES resource_types(id)
);

-- Replaces ai-service/model/BMA_Training_Data.xlsx as the ambulance source.
CREATE TABLE IF NOT EXISTS ambulances (
    id           INT AUTO_INCREMENT PRIMARY KEY,
    hospital_id  INT NULL,                        -- NULL = independent / city fleet
    driver_name  VARCHAR(100) NOT NULL,
    contact      VARCHAR(20)  NOT NULL,
    latitude     DECIMAL(9,6) NULL,
    longitude    DECIMAL(9,6) NULL,
    city         VARCHAR(80)  NULL,
    status       ENUM('available', 'dispatched', 'offline') NOT NULL DEFAULT 'available',
    CONSTRAINT fk_ambulances_hospital FOREIGN KEY (hospital_id) REFERENCES hospitals(id) ON DELETE SET NULL,
    INDEX idx_ambulances_status (status)
);

CREATE TABLE IF NOT EXISTS incidents (
    id             INT AUTO_INCREMENT PRIMARY KEY,
    hospital_id    INT NOT NULL,
    ambulance_id   INT NULL,
    city           VARCHAR(80)  NULL,             -- city the dispatch was requested for
    patient_lat    DECIMAL(9,6) NOT NULL,
    patient_lng    DECIMAL(9,6) NOT NULL,
    distance_km    DECIMAL(6,2) NULL,
    status         ENUM('dispatched', 'en_route', 'arrived', 'closed', 'cancelled') NOT NULL DEFAULT 'dispatched',
    dispatched_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    arrived_at     TIMESTAMP NULL,
    CONSTRAINT fk_incidents_hospital  FOREIGN KEY (hospital_id)  REFERENCES hospitals(id) ON DELETE CASCADE,
    CONSTRAINT fk_incidents_ambulance FOREIGN KEY (ambulance_id) REFERENCES ambulances(id) ON DELETE SET NULL,
    INDEX idx_incidents_hosp_time (hospital_id, dispatched_at)
);
