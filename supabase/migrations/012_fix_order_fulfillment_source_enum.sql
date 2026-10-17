-- The create_order function used a fulfillment_source enum value that does not exist.
-- Rebuild the installed function definition with the valid value for farm-grown items.
DO $$
DECLARE
    function_definition TEXT;
BEGIN
    SELECT pg_get_functiondef(p.oid)
    INTO function_definition
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname = 'create_order'
    ORDER BY p.oid DESC
    LIMIT 1;

    IF function_definition IS NULL THEN
        RAISE EXCEPTION 'Could not find public.create_order()';
    END IF;

    function_definition := replace(function_definition, '''farm''', '''own''');
    EXECUTE function_definition;
END $$;
