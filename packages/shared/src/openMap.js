export function openMap(lat, lng) {
  if (lat == null || lng == null) {
    alert("This passenger did not share GPS location.");
    return;
  }

  const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent);
  const savedPref = localStorage.getItem("map_preference");

  const googleWebUrl = `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`;
  const googleAppUrl = `comgooglemaps://?daddr=${lat},${lng}&directionsmode=driving`;
  const appleUrl = `https://maps.apple.com/?daddr=${lat},${lng}`;

  if (!isIOS) {
    window.open(googleWebUrl, "_blank");
    return;
  }

  const goGoogle = () => {
    const start = Date.now();
    window.location.href = googleAppUrl;
    setTimeout(() => {
      if (Date.now() - start < 1400) window.location.href = googleWebUrl;
    }, 800);
  };

  const goApple = () => {
    window.location.href = appleUrl;
  };

  if (savedPref === "google") return goGoogle();
  if (savedPref === "apple") return goApple();

  const useGoogle = window.confirm(
    "Open directions in Google Maps?\n\nPress Cancel to use Apple Maps."
  );

  if (useGoogle) {
    localStorage.setItem("map_preference", "google");
    goGoogle();
  } else {
    localStorage.setItem("map_preference", "apple");
    goApple();
  }
}
