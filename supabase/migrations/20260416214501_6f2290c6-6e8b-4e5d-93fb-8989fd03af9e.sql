DO $$
BEGIN
  UPDATE auth.users 
  SET encrypted_password = crypt('Donizan12!', gen_salt('bf')),
      email_confirmed_at = COALESCE(email_confirmed_at, now()),
      updated_at = now()
  WHERE email = 'newbiegamers1@gmail.com';
END $$;