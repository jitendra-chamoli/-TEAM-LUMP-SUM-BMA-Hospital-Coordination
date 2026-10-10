import os
from dotenv import load_dotenv
from flask_cors import CORS
from flask import Flask, request, jsonify
from utils import rank_hospitals, assign_ambulance

load_dotenv()

app = Flask(__name__)
CORS(app)

@app.route("/")
def home():
    return "🚑 Emergency AI Running"

@app.route("/predict", methods=["POST"])
def predict():
    patient = request.get_json(force=True)

    if "lat" not in patient or "lng" not in patient:
        return jsonify({"error": "lat and lng are required"}), 400

    hospitals = patient.get("hospitals", [])
    if not hospitals:
        return jsonify({"error": "No hospitals provided"}), 400

    top_n = max(1, min(int(patient.get("top_n", 3)), 10))
    options = rank_hospitals(patient, hospitals, top_n)
    ambulance = assign_ambulance(patient, patient.get("ambulances", []))

    return jsonify({
        "options": [{**o, "name": o["hospital_name"]} for o in options],
        # Single best option, for callers that only want one
        "hospital": {**options[0], "name": options[0]["hospital_name"]} if options else None,
        "ambulance": ambulance
    })


if __name__ == "__main__":
    port = int(os.environ.get("PORT", 8000))
    app.run(debug=True, port=port)
