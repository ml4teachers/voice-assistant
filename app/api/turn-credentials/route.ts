import { NextResponse } from 'next/server';
import twilio from 'twilio'; // Import the library

export async function GET() {
    const accountSid = process.env.TWILIO_ACCOUNT_SID;
    const authToken = process.env.TWILIO_AUTH_TOKEN;

    if (!accountSid || !authToken) {
        console.error("Twilio credentials missing in environment variables.");
        return NextResponse.json({ error: 'Server configuration error: Missing Twilio credentials.' }, { status: 500 });
    }

    // Instantiate Twilio Client
    const client = twilio(accountSid, authToken);

    try {
        // Fetch temporary STUN/TURN server info including credentials
        // TTL (Time-To-Live) in seconds, e.g., 1 hour (3600) or 4 hours (14400)
        const token = await client.tokens.create({ ttl: 3600 });

        // The token object directly contains the iceServers array
        // console.log("Twilio Token Response:", token); // Optional: Log response structure

        if (token.iceServers) {
             console.log("Successfully fetched temporary TURN credentials from Twilio.");
             return NextResponse.json({ iceServers: token.iceServers });
        } else {
             console.error("Twilio response did not contain iceServers.");
             return NextResponse.json({ error: 'Failed to retrieve TURN configuration from provider.' }, { status: 500 });
        }

    } catch (error) {
        console.error('Error fetching Twilio TURN credentials:', error);
         const errorMessage = error instanceof Error ? error.message : 'Unknown error fetching TURN credentials';
         return NextResponse.json({ error: `Failed to fetch TURN credentials: ${errorMessage}` }, { status: 500 });
    }
}
