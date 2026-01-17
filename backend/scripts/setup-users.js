import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function setupUsers() {
  try {
    const psychId = 'psych-001-' + Date.now();
    const patientId = 'patient-001-' + Date.now();

    // Create psychologist
    const { data: psych, error: psychError} = await supabase
      .from('users')
      .insert({
        id: psychId,
        data: {
          id: psychId,
          name: 'Garry Javi',
          email: 'garryjavi@gmail.com',
          password: '123',
          role: 'PSYCHOLOGIST',
          accessList: [patientId]
        }
      })
      .select()
      .single();

    if (psychError) {
      console.error('Error creating psychologist:', psychError);
      return;
    }

    console.log('✅ Psychologist created:', psychId);

    // Create patient
    const { data: patient, error: patientError } = await supabase
      .from('users')
      .insert({
        id: patientId,
        data: {
          id: patientId,
          name: 'Garrido Javier Fernandez',
          email: 'garridojavierfernandez@gmail.com',
          password: '123',
          role: 'PATIENT',
          accessList: [psychId]
        }
      })
      .select()
      .single();

    if (patientError) {
      console.error('Error creating patient:', patientError);
      return;
    }

    console.log('✅ Patient created:', patientId);

    // Create invitation
    const invId = 'inv-001-' + Date.now();
    const { data: invitation, error: invError } = await supabase
      .from('invitations')
      .insert({
        id: invId,
        data: {
          id: invId,
          fromPsychologistId: psychId,
          fromPsychologistName: 'Garry Javi',
          toUserEmail: 'garridojavierfernandez@gmail.com',
          status: 'ACCEPTED',
          timestamp: Date.now()
        }
      })
      .select()
      .single();

    if (invError) {
      console.error('Error creating invitation:', invError);
      return;
    }

    console.log('✅ Invitation created:', invId);
    console.log('\n🎉 Setup completed successfully!');
    console.log('\nLogin credentials:');
    console.log('Psychologist: garryjavi@gmail.com / 123');
    console.log('Patient: garridojavierfernandez@gmail.com / 123');
    console.log('\nIDs:');
    console.log('Psychologist ID:', psychId);
    console.log('Patient ID:', patientId);

  } catch (error) {
    console.error('Error during setup:', error);
  }
}

setupUsers();
