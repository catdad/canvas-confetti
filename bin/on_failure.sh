line_break () {
  echo --------------------------------------
}

upload_file () {
  filename=$1
  urlname=${filename// /_}

  downloadurl=`curl -sS --upload-file "./$filename" https://transfer.sh/$urlname`

  echo image \"$filename\"
  echo "  uploaded to: $downloadurl"
}

find_files () {
  cd shots

  echo list of files present:
  ls -l
  line_break

  for i in *.png;do upload_file "$i";done
}

find_files
