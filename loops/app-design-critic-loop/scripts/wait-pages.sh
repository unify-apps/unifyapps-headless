#!/bin/bash
# Blocks until the explorer has finished more pages than the main thread has already handed to critics,
# or until the explorer writes RUN/EXPLORE_DONE. Run it in the background; it exits to wake the main thread.
# usage: wait-pages.sh <RUN> <pages-already-dispatched> [min-new=2]
RUN="$1"; SEEN="$2"; MIN_NEW="${3:-2}"
while true; do
  DONE=$(ls "$RUN"/pages/*/DONE 2>/dev/null | wc -l | tr -d ' ')
  if [ -f "$RUN/EXPLORE_DONE" ]; then echo "explore finished; pages done: $DONE"; exit 0; fi
  if [ $(( DONE - SEEN )) -ge "$MIN_NEW" ]; then
    echo "pages done: $DONE (new since last dispatch: $(( DONE - SEEN )))"
    ls -d "$RUN"/pages/*/DONE | sed 's#/DONE##' | tail -n $(( DONE - SEEN ))
    exit 0
  fi
  sleep 20
done
