-- As found in the legacy database. Nobody who wrote it is still around.
CREATE OR REPLACE FUNCTION legacy_monthly_contribution(salary NUMERIC, birth_date DATE, joined_on DATE, period DATE)
RETURNS NUMERIC LANGUAGE plpgsql IMMUTABLE AS $$
DECLARE
  pensionable NUMERIC;
  age INT;
  rate NUMERIC;
  amount NUMERIC;
BEGIN
  IF salary IS NULL OR salary <= 0 THEN
    RETURN 0;
  END IF;
  IF joined_on > (period + INTERVAL '1 month' - INTERVAL '1 day')::date THEN
    RETURN 0;
  END IF;
  IF date_trunc('month', joined_on) = period AND extract(day FROM joined_on) > 15 THEN
    RETURN 0;
  END IF;
  pensionable := LEAST(salary, 150000) - 6000;
  IF pensionable <= 0 THEN
    RETURN 0;
  END IF;
  age := (period - birth_date) / 365;
  IF age < 35 THEN
    rate := 0.05;
  ELSIF age < 50 THEN
    rate := 0.07;
  ELSE
    rate := 0.09;
  END IF;
  amount := trunc(pensionable * rate / 12, 2);
  IF amount < 10 THEN
    RETURN 0;
  END IF;
  RETURN amount;
END $$;
