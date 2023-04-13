import { NextRequest, NextResponse } from "next/server";
import { getServerSideConfig } from "./app/config/server";
import md5 from "spark-md5";
import jwtDecode, { JwtPayload } from "jwt-decode";

export const config = {
  matcher: ["/api/openai", "/api/chat-stream"],
};

const serverConfig = getServerSideConfig();

export function middleware(req: NextRequest) {
  const accessCode = req.headers.get("access-code");
  const token = req.headers.get("token");
  const auth0Token = req.headers.get("auth0-token");
  const hashedCode = md5.hash(accessCode ?? "").trim();

  // case1: provided apikey
  if (token) {
    console.log("[Auth] set user token");
    return NextResponse.next();
  }

  // inject apiKey
  const apiKey = serverConfig.apiKey;
  if (apiKey) {
    req.headers.set("token", apiKey);
  } else {
    return NextResponse.json(
      {
        error: true,
        msg: "Empty Api Key",
      },
      {
        status: 401,
      },
    );
  }

  // case2: matched access code
  if (serverConfig.needCode && serverConfig.codes.has(hashedCode)) {
    console.log("[Auth] allowed hashed codes: ", [...serverConfig.codes]);
    console.log("[Auth] got access code:", accessCode);
    console.log("[Auth] hashed access code:", hashedCode);
    console.log("[Auth] matched access code");
    return NextResponse.next({
      request: {
        headers: req.headers,
      },
    });
  }

  // case3: logined user
  if (auth0Token) {
    const decoded = jwtDecode<JwtPayload>(auth0Token);
    if (decoded.iss === process.env.AUTH0_ISSUER_BASE_URL) {
      console.log("[Auth] logined user");
      return NextResponse.next({
        request: {
          headers: req.headers,
        },
      });
    }
    return NextResponse.json(
      {
        error: true,
        msg: "Invalid Auth0 Token",
      },
      {
        status: 401,
      },
    );
  }

  // default: reject
  console.log("[Auth] auth failed:", req.headers.get("path"));
  return NextResponse.json(
    {
      error: true,
      msg: "Please go settings page and login.",
    },
    {
      status: 401,
    },
  );
}
