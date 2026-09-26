-- cube: web_monthly_browser (month x browser)
SELECT
  FORMAT_DATE('%F', DATE_TRUNC(DATE(e.created_at), MONTH)) AS date,
  e.browser,
  COUNT(DISTINCT e.session_id) AS sessions,
  COUNT(*) AS events,
  COUNTIF(e.event_type = 'purchase') AS purchases,
  COUNTIF(e.event_type = 'cart') AS cart_adds
FROM `bigquery-public-data.thelook_ecommerce.events` e
WHERE DATE(e.created_at) >= DATE_SUB(CURRENT_DATE(), INTERVAL 24 MONTH)
  AND DATE(e.created_at) < CURRENT_DATE()
GROUP BY 1, 2
ORDER BY 1, 2
