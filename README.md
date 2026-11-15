# Climate Watch

Climate Watch is a prototype for recording daily local weather data and monitoring fire-risk conditions.

The application gives organizations a dashboard for logging temperature and rainfall readings, reviewing historical records, and viewing a simple fire-risk indicator.

![Prevent wildfires](https://unsplash.com/photos/wildfire-burning-across-hillside-at-dusk-kbTp7dBzHyY)

## Features

- **Organization dashboards:** View weather records and fire-risk summaries for each organization.
- **Weather data logging:** Record daily temperature and rainfall readings.
- **Risk indicators:** View fire risk based on the date and recorded rainfall.
- **Data history:** Review recorded observations in a paginated table.
- **Organization management:** Create, update, and manage organization accounts through a separate admin portal.
- **Access control:** Separate organization and administrator access.

## How the fire-risk indicator works

The current prototype considers the month (whether it falls within a season considered dry) and the amount of rainfall recorded.

It assigns high, medium, or low risk classifications based on seasonal patterns and rainfall conditions.

> **Note:** This is an early-stage heuristic, not a predictive fire model. Temperature is recorded and displayed, but it is not currently used in the risk calculation.

## Technology

- HTML, CSS, and JavaScript
- Supabase
- Supabase Auth
- Supabase PostgreSQL
- Supabase Edge Functions (Deno and TypeScript)
- Git

## Run locally

You will need:

- Python 3 or another local static web server
- A modern web browser
- Internet access
- A configured Supabase project

Clone the repository:

```bash
git clone https://github.com/adoraa/climate_watch.git
cd climate_watch
```

Start a local server:

```bash
python -m http.server 8000
```

Open [http://localhost:8000](http://localhost:8000) in your browser.

## Supabase setup

The frontend currently connects to a configured Supabase project. To use a different project, update the Supabase project URL and public anon key in `app.js` and `admin.js`.

The application also needs two database tables: `organizations` and `weather_entries`.

The repository doesn't include database migration files, so you'll need to set up the tables, authentication, and access policies in your Supabase project.

### Admin portal

The admin portal uses a Supabase Edge Function located in `supabase/functions/admin-manage/`. Deploy the function to your Supabase project and configure its required environment variables before using the portal.

## Project status

Early-stage prototype.

## Contributing

Contributions are welcome. You can fork the repository, create a branch, and open a pull request.

## License

This project is licensed under the MIT License.
