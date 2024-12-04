import pkg from 'cityjs'
import S from 'fluent-json-schema'
import googleHelmet from '../options/helmet.js'
import { fetchWeather, fetchWeather0, formatCities, messages } from '../services/helpers.js'
const { nearestCities } = pkg

async function routes(fastify, options) {
    const { redis } = fastify
    fastify.get('/', { helmet: googleHelmet }, function (req, reply) {
        reply.view('./index', {
            key: process.env.GOOGLE_MAPS_API_KEY,
            lang: 'en',
            messages: messages,
        })
    })

    fastify.get('/fr', { helmet: googleHelmet }, function (req, reply) {
        reply.view('./index_fr', {
            key: process.env.GOOGLE_MAPS_API_KEY,
            lang: 'fr',
            messages: messages,
        })
    })

    fastify.get('/ar', { helmet: googleHelmet }, function (req, reply) {
        reply.view('./index_en', {
            key: process.env.GOOGLE_MAPS_API_KEY,
            lang: 'ar',
            messages: messages,
        })
    })

    fastify.get('/weatherMap/:url', async function (req, reply) {
        if (!req.params.url) {
            return res.status(400).send({
                error: true,
                message: 'Bad request',
                data: 'Bad request',
            })
        }
        const urlParams = JSON.parse(req.params.url)
        let westLng, northLat, eastLng, southLat, mapZoom
            ; ({ westLng, northLat, eastLng, southLat, mapZoom } = urlParams)
        const action = fetchWeather0(westLng, northLat, eastLng, southLat, mapZoom)
        Promise.resolve(action).then(function (response) {
            return res.status(200).send({
                error: false,
                message: 'Weather data for weather map',
                data: response.data,
            })
        })
    })

    let language = 'en'
    const reqSchema = S.object()
        .prop('lat', S.number().minimum(-90).maximum(90).required())
        .prop('lng', S.number().minimum(-180).maximum(180).required())
        .prop('cityname', S.string().minLength(3).maxLength(180).required())
        .prop('language', S.string().minLength(2).maxLength(2).required())

        fastify.get('/nearby', async function (req, reply) {
            const { language, lat, lng } = req.query;
        
            const query = {
                latitude: lat,
                longitude: lng,
            };
        
            // Fetch nearby cities
            const cities = nearestCities(query, 10);

            const cityDataPromises = cities.map(async (city) => {
                const cacheKey = `wv:city:${city.name}`;
                let cityData = await redis.get(cacheKey);
                if (!cityData) {
                    // Fetch city weather and cache it
                    const weatherData = await fetchWeather(city, language);
                    cityData = {
                        city,
                        weather: weatherData.weather,
                        pollution: weatherData.pollution,
                    };
                    await redis.setex(cacheKey, 24 * 60 * 60, JSON.stringify(cityData)); // Cache for 24 hours
                } else {
                    cityData = JSON.parse(cityData);
                }
                
                return cityData;
            });
        
            // Resolve all city data promises
            const allCityData = await Promise.all(cityDataPromises);
            
            // Format and return the results
            const result = formatCities(
                allCityData.map((data) => data.city),
                allCityData.map((data) => data.weather),
                allCityData.map((data) => data.pollution)
            );

            return reply.send({
                error: false,
                message: 'Weather data for nearby cities fetched and cached by city',
                data: result,
            });
        })
    };
        

export default routes
