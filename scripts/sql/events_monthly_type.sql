-- cube: events_monthly_type (month x event_type x traffic_source)
SELECT
  FORMAT_DATE('%F', DATE_TRUNC(DATE(e.created_at), MONTH)) AS date,
  e.event_type,
  e.traffic_source,
  COUNT(*) AS events
FROM `bigquery-public-data.thelook_ecommerce.events` e
WHERE DATE(e.created_at) >= DATE_SUB(CURRENT_DATE(), INTERVAL 24 MONTH)
  AND DATE(e.created_at) < CURRENT_DATE()
GROUP BY 1, 2, 3
ORDER BY 1, 2, 3
