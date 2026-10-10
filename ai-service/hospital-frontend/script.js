function callAmbulance() {

    navigator.geolocation.getCurrentPosition(position => {

        const lat = position.coords.latitude;
        const lng = position.coords.longitude;

        fetch("http://127.0.0.1:5000/predict", {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify({ lat, lng })
        })
        .then(res => res.json())
        .then(data => {

            document.getElementById("output").innerHTML =
                `🏥 ${data.hospital} <br>
                 🚑 Driver: ${data.driver}`;

            const mapUrl =
                `https://maps.google.com/maps?q=${data.lat},${data.lng}&z=15&output=embed`;

            document.getElementById("map").src = mapUrl;
        });

    });
}