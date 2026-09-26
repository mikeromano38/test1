-- cube: users_monthly (month x traffic_source x gender x age_band x country[top 8 + Other])
WITH top_countries AS (
  SELECT country FROM `bigquery-public-data.thelook_ecommerce.users` GROUP BY 1 ORDER BY COUNT(*) DESC LIMIT 8
)
SELECT
  FORMAT_DATE('%F', DATE_TRUNC(DATE(u.created_at), MONTH)) AS date,
  u.traffic_source,
  u.gender,
  CASE WHEN u.age < 25 THEN 'Under 25' WHEN u.age < 35 THEN '25-34' WHEN u.age < 45 THEN '35-44'
       WHEN u.age < 55 THEN '45-54' ELSE '55+' END AS age_band,
  IF(u.country IN (SELECT country FROM top_countries), u.country, 'Other') AS country,
  COUNT(*) AS new_users
FROM `bigquery-public-data.thelook_ecommerce.users` u
WHERE DATE(u.created_at) >= DATE_SUB(CURRENT_DATE(), INTERVAL 24 MONTH)
  AND DATE(u.created_at) < CURRENT_DATE()
GROUP BY 1, 2, 3, 4, 5
ORDER BY 1, 2, 3, 4, 5
