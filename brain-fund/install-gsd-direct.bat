@echo off
echo Cloning Get Shit Done repository...
git clone https://github.com/gsd-build/get-shit-done.git gsd-temp
cd gsd-temp
echo.
echo Running installer...
node bin/install.js --claude --global
echo.
cd ..
echo.
echo Cleaning up...
rmdir /s /q gsd-temp
echo.
echo Installation complete!
pause
