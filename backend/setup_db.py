"""
One-time PostgreSQL setup for DigiBank.

Creates the application role and database described in backend/.env, then leaves
migrations to manage.py.

Run it once:

    venv\\Scripts\\python.exe setup_db.py

It asks for your PostgreSQL SUPERUSER password (the one you chose for the
`postgres` account when you installed PostgreSQL). That password is read
straight into the connection with getpass, so it is never echoed to the screen,
never written to a file, and never stored anywhere.

The application role's own password is read from .env, so you never have to
type that one - and the two can never drift apart, which is the usual cause of
"password authentication failed for user digibank".
"""
import getpass
import os
import sys
from pathlib import Path

try:
    import psycopg2
    from psycopg2 import sql
    from psycopg2.extensions import ISOLATION_LEVEL_AUTOCOMMIT
except ImportError:
    sys.exit("psycopg2 is missing. Activate the venv, then: pip install -r requirements.txt")

from dotenv import load_dotenv

BASE_DIR = Path(__file__).resolve().parent
load_dotenv(BASE_DIR / ".env")

DB_NAME = os.environ.get("POSTGRES_DB", "digibank")
DB_USER = os.environ.get("POSTGRES_USER", "digibank")
DB_PASSWORD = os.environ.get("POSTGRES_PASSWORD", "")
DB_HOST = os.environ.get("POSTGRES_HOST", "127.0.0.1")
DB_PORT = os.environ.get("POSTGRES_PORT", "5432")

SUPERUSER = os.environ.get("POSTGRES_SUPERUSER", "postgres")


def main():
    if not DB_PASSWORD:
        sys.exit("POSTGRES_PASSWORD is empty in .env. Set it first, then re-run.")

    print(f"DigiBank database setup")
    print(f"  server : {DB_HOST}:{DB_PORT}")
    print(f"  role   : {DB_USER}")
    print(f"  db     : {DB_NAME}")
    print()
    print(f"Enter the password for the PostgreSQL superuser '{SUPERUSER}'.")
    print("(Nothing appears as you type. It is used for this connection only.)")
    superuser_password = getpass.getpass(f"{SUPERUSER} password: ")

    try:
        conn = psycopg2.connect(
            dbname="postgres",
            user=SUPERUSER,
            password=superuser_password,
            host=DB_HOST,
            port=DB_PORT,
        )
    except psycopg2.OperationalError as exc:
        sys.exit(f"\nCould not connect as '{SUPERUSER}': {exc}")

    conn.set_isolation_level(ISOLATION_LEVEL_AUTOCOMMIT)
    cur = conn.cursor()

    # -- role ---------------------------------------------------------------
    cur.execute("SELECT 1 FROM pg_roles WHERE rolname = %s", (DB_USER,))
    if cur.fetchone():
        cur.execute(
            sql.SQL("ALTER ROLE {} WITH LOGIN PASSWORD %s").format(sql.Identifier(DB_USER)),
            (DB_PASSWORD,),
        )
        print(f"  role '{DB_USER}' already existed - password reset to match .env")
    else:
        cur.execute(
            sql.SQL("CREATE ROLE {} WITH LOGIN PASSWORD %s").format(sql.Identifier(DB_USER)),
            (DB_PASSWORD,),
        )
        print(f"  created role '{DB_USER}'")

    # Lets the role run `manage.py test`, which builds a throwaway database.
    cur.execute(sql.SQL("ALTER ROLE {} CREATEDB").format(sql.Identifier(DB_USER)))

    # -- database -----------------------------------------------------------
    cur.execute("SELECT 1 FROM pg_database WHERE datname = %s", (DB_NAME,))
    if cur.fetchone():
        print(f"  database '{DB_NAME}' already exists - left alone")
    else:
        cur.execute(
            sql.SQL("CREATE DATABASE {} OWNER {}").format(
                sql.Identifier(DB_NAME), sql.Identifier(DB_USER)
            )
        )
        print(f"  created database '{DB_NAME}'")

    cur.close()
    conn.close()

    # -- schema privileges --------------------------------------------------
    # PostgreSQL 15+ revoked CREATE on the public schema from everyone but the
    # owner. Without this grant, migrate fails with "permission denied for
    # schema public" even though the role owns the database.
    conn = psycopg2.connect(
        dbname=DB_NAME,
        user=SUPERUSER,
        password=superuser_password,
        host=DB_HOST,
        port=DB_PORT,
    )
    conn.set_isolation_level(ISOLATION_LEVEL_AUTOCOMMIT)
    cur = conn.cursor()
    cur.execute(sql.SQL("GRANT ALL ON SCHEMA public TO {}").format(sql.Identifier(DB_USER)))
    cur.execute(
        sql.SQL("ALTER SCHEMA public OWNER TO {}").format(sql.Identifier(DB_USER))
    )
    cur.close()
    conn.close()
    print("  granted schema privileges")

    # -- verify -------------------------------------------------------------
    try:
        check = psycopg2.connect(
            dbname=DB_NAME, user=DB_USER, password=DB_PASSWORD, host=DB_HOST, port=DB_PORT
        )
        check.close()
    except psycopg2.OperationalError as exc:
        sys.exit(f"\nSetup ran but '{DB_USER}' still cannot connect: {exc}")

    print("\nDatabase is ready. Next:")
    print("  venv\\Scripts\\python.exe manage.py migrate")


if __name__ == "__main__":
    main()
