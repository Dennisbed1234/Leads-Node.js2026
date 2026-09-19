const { Country, State, City } = require('country-state-city');

/** Prefer US; still allow other countries if needed */
const PRIMARY_COUNTRIES = ['US'];
const ALLOWED_EXTRA = ['CA', 'GB', 'AU']; // optional extras

exports.getCountries = (req, res) => {
    const all = Country.getAllCountries();
    const primary = all.filter(c => PRIMARY_COUNTRIES.includes(c.isoCode));
    const extra = all.filter(c => ALLOWED_EXTRA.includes(c.isoCode));
    // US first, then a few common English-speaking countries
    res.json([...primary, ...extra]);
};

exports.getStates = (req, res) => {
    const { countryCode } = req.params;
    const states = State.getStatesOfCountry(countryCode) || [];
    res.json(states);
};

exports.getCities = (req, res) => {
    const { countryCode, stateCode } = req.params;
    const cities = City.getCitiesOfState(countryCode, stateCode) || [];
    // Sort by name for easier browsing
    cities.sort((a, b) => String(a.name).localeCompare(String(b.name)));
    res.json(cities);
};

exports.getAreas = (req, res) => {
    // US doesn't need India-style area micro-divisions; return empty for now
    // Callers can still type a custom neighborhood in the UI
    res.json([]);
};
