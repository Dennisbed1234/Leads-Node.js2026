const express = require('express');
const router = express.Router();
const searchController = require('../controllers/searchController');
const geoController = require('../controllers/geoController');

router.post('/search', searchController.search);
router.get('/search/stream', searchController.searchStream);
router.get('/sources', searchController.listSources);

// Geo — US-first (also CA, GB, AU)
router.get('/countries', geoController.getCountries);
router.get('/countries/:countryCode/states', geoController.getStates);
router.get('/countries/:countryCode/states/:stateCode/cities', geoController.getCities);
router.get('/countries/:countryCode/states/:stateCode/cities/:city/areas', geoController.getAreas);

module.exports = router;
