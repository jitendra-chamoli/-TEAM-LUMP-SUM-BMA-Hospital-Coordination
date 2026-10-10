from math import radians, sin, cos, sqrt, atan2


def haversine_km(lat1, lng1, lat2, lng2):
    """Great-circle distance in km between two lat/lng points."""
    R = 6371
    phi1, phi2 = radians(lat1), radians(lat2)
    dphi = radians(lat2 - lat1)
    dlambda = radians(lng2 - lng1)
    a = sin(dphi / 2) ** 2 + cos(phi1) * cos(phi2) * sin(dlambda / 2) ** 2
    return 2 * R * atan2(sqrt(a), sqrt(1 - a))


# ---------------- HOSPITAL LOGIC ---------------- #
# How much each kilometre costs, by severity: for critical patients time matters most.
DISTANCE_WEIGHT = {"critical": 5, "serious": 3, "stable": 2}


# How strongly a payer preference counts, by severity. A critical patient is never
# routed on cost: the server doesn't send preferences for them, and this is a second guard.
PREFERENCE_WEIGHT = {"critical": 0.0, "serious": 0.5, "stable": 1.0}


def payer_bonus(patient, h):
    """Nudge towards hospitals where the patient's payment route actually works."""
    weight = PREFERENCE_WEIGHT.get(patient.get("severity", "serious"), 0.5)
    if weight == 0:
        return 0, {}

    wanted_schemes = set(patient.get("prefer_schemes") or [])
    wanted_types = set(patient.get("prefer_types") or [])
    if not wanted_schemes and not wanted_types:
        return 0, {}

    has_scheme = bool(wanted_schemes & set(h.get("schemes") or []))
    type_matches = h.get("type") in wanted_types if wanted_types else False

    # Sized against the distance weights: for a stable patient a scheme match is worth
    # roughly 12 km of extra travel, for a serious one about 4 km. A card that works can
    # be the difference between a free stay and a six-figure bill, and a stable patient
    # can travel. A critical patient never trades distance for cost (weight 0 above).
    bonus = (25 if has_scheme else 0) + (12 if type_matches else 0)
    return bonus * weight, {
        "scheme_match": has_scheme,
        "type_match": type_matches,
        "payment_not_covered": bool(wanted_schemes) and not has_scheme,
    }


def score_hospital(patient, h):
    """Score one hospital and record the facts behind it, so the dispatcher sees why."""
    severity = patient.get("severity", "serious")
    needs_icu = bool(patient.get("needs_icu"))
    distance = haversine_km(patient["lat"], patient["lng"], h["latitude"], h["longitude"])

    beds = h.get("beds_available", 0)
    icu = h.get("icu_available", 1 if h.get("has_icu") else 0)
    specialists = h.get("specialist_doctors", 0)
    emergency = h.get("emergency_doctors", 0)

    score = max(0, 60 - distance * DISTANCE_WEIGHT.get(severity, 3))
    score += min(beds, 20) * 0.5
    if needs_icu:
        score += 25 if icu > 0 else -30
    elif icu > 0:
        score += 8 if severity == "critical" else 4
    if specialists > 0:
        score += (25 if severity == "critical" else 20) + min(specialists, 3) * 2
    if emergency > 0:
        score += 8 + min(emergency, 3)
    if specialists == 0 and emergency == 0:
        score -= 25
    if beds <= 0:
        score -= 100  # only offered when nothing better exists

    bonus, payer_flags = payer_bonus(patient, h)
    score += bonus

    return {
        **h,
        "distance_km": round(distance, 2),
        "score": round(score, 1),
        "flags": {
            "no_beds": beds <= 0,
            "icu_unavailable": needs_icu and icu <= 0,
            "no_specialist": specialists == 0,
            "no_doctor_on_duty": specialists == 0 and emergency == 0,
            **payer_flags,
        },
    }


def rank_hospitals(patient, hospitals, top_n=3):
    """Best hospitals first. Hospitals without free beds only appear if there is no other choice."""
    scored = sorted((score_hospital(patient, h) for h in hospitals), key=lambda x: x["score"], reverse=True)
    with_beds = [h for h in scored if not h["flags"]["no_beds"]]
    return (with_beds or scored)[:top_n]


# Kept for older callers: the single best hospital.
def select_hospital(patient, hospitals):
    ranked = rank_hospitals(patient, hospitals, 1)
    return ranked[0] if ranked else None


# ---------------- AMBULANCE LOGIC ---------------- #
def assign_ambulance(patient, ambulances):
    """Pick the nearest ambulance from the available list the orchestrator sends (ambulances table)."""
    best = None
    best_distance = float("inf")

    for amb in ambulances:
        distance = haversine_km(patient["lat"], patient["lng"], amb["lat"], amb["lng"])
        if distance < best_distance:
            best_distance = distance
            best = amb

    if best is None:
        return None

    # Pass through extra fields (vehicle number, type, live GPS flag) untouched.
    return {**best, "distance_km": round(best_distance, 2)}
