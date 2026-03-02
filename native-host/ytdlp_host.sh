#!/bin/bash
export PATH="/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:$PATH"
DIR="$( cd "$( dirname "$0" )" && pwd )"
exec python3 "$DIR/ytdlp_host.py" "$@"
