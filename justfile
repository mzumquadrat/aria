name := "aria"
version := "0.1.0"
target := "x86_64-unknown-linux-gnu"

build:
    deno compile \
        --allow-net \
        --allow-env \
        --allow-read \
        --allow-write \
        --allow-run \
        --allow-sys \
        --allow-ffi \
        --allow-import \
        --target {{target}} \
        --output dist/{{name}} \
        src/main.ts

build-release: build

dist: build
    mkdir -p dist/package
    cp dist/{{name}} dist/package/
    cp config.yaml dist/package/
    cp .env.example dist/package/
    cp soul.md dist/package/
    cp README.md dist/package/
    cp deno.json dist/package/
    tar -cvzf dist/{{name}}-{{version}}-{{target}}.tar.gz -C dist/package .
    rm -rf dist/package

clean:
    rm -rf dist/

run:
    deno run --allow-net --allow-env --allow-read --allow-write --allow-run --allow-sys --allow-ffi --allow-import src/main.ts

dev:
    deno run --watch --allow-net --allow-env --allow-read --allow-write --allow-run --allow-sys --allow-ffi --allow-import src/main.ts

test:
    deno test --allow-net --allow-env --allow-read --allow-write --allow-run --allow-sys --allow-ffi --allow-import tests/

lint:
    deno lint

fmt:
    deno fmt

check:
    deno check --allow-import src/main.ts
