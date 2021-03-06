      *>--------------------------------------------------------------------------------------------------------------<*
      *>                                                Calcula o ICMS                                                <*
      *>--------------------------------------------------------------------------------------------------------------<*
       identification             division.
       program-id.                CALICM.
      *>--------------------------------------------------------------------------------------------------------------<*
       environment                division.
       configuration              section.
       special-names.
           decimal-point     is   comma,
           console           is   crt.
      *>--------------------------------------------------------------------------------------------------------------<*
       data                       division.
       working-storage            section.
      *>-> Nome do programa
       78  w78-nomprg                             value is "CALICM".
      *>-> Vari�vel pai
       01  w-pai-filho-unico.
      *>-> Filho �nico
           05 w-filho-unico       pic is 9(06)V99 value is zeros comp-x.
      *>-> Pai
       01  w-pai.
      *>-> Filho num�rico
           05 w-filho-numerico    pic is 9(06)V99 value is zeros.
      *>-> Filho PICX
           05 w-filho-picx        pic is xxx      value is space.
      *>-> Filho com 88
           05 w-filho-pai-oito-oito pic is x(01)  value is "F".
      *>-> Coment�rio diferente para o primeiro n�vel 88
              88 filho-pai-oito-oito-pri          value is "P".
      *>-> Coment�rio diferente para o segundo n�vel 88
              88 filho-pai-oito-oito-seg          value is "S".
              88 filho-pai-oito-oito-ter          value is "T".
      *>-> Vari�vel filha com filho
           05 w-filho-com-filho.
      *>-> Neto
              10 w-neto           pic is xxx      value is space.
      *>-> Variavel pai
       01  w-pai-oito-oito        pic is x(01)    value is "F".
      *>-> Coment�rio diferente para o primeiro n�vel 88
           88 pai-oito-oito-pri                   value is "P".
      *>-> Coment�rio diferente para o segundo n�vel 88
           88 pai-oito-oito-seg                   value is "S".
           88 pai-oito-oito-ter                   value is "T".
       01  w-uf                   pic is x(02)    value is "SP".
      *>-> N�vel 77
       77  w-nivel-77             pic is x(01)    value is spaces.
      *>-> Vari�veis para teste de tamanho
       01  w-byte-size.
           05 w-byte-size-40.
              10 w-byte-size-30   pic is x(30)    value is spaces.
              10 w-byte-size-10   pic is 9(05),9(04) value is zeros.
           05 w-any-length.
              10 w-byte-size-64.
                 15 w-byte-size-09.
                    20 w-byte-size-pic1 pic is 9(01) value is zeros comp-x.
                    20 w-byte-size-pic2 pic is 9(02) value is zeros comp-x.
                    20 w-byte-size-pic3 pic is 9(03) value is zeros comp-x.
                    20 w-byte-size-pic4 pic is 9(04) value is zeros comp-x.
                    20 w-byte-size-pic5 pic is 9(05) value is zeros comp-x.
                 15 w-byte-size-10.
                    20 w-byte-size-pic6 pic is 9(06) value is zeros comp-x.
                    20 w-byte-size-pic7 pic is 9(07) value is zeros comp-x.
                    20 w-byte-size-pic8 pic is 9(08) value is zeros comp-x.
                 15 w-byte-size-19.
                    20 w-byte-size-pic9 pic is 9(09) value is zeros comp-x.
                    20 w-byte-size-pic10 pic is 9(10) value is zeros comp-x.
                    20 w-byte-size-pic11 pic is 9(11) value is zeros comp-x.
                    20 w-byte-size-pic12 pic is 9(12) value is zeros comp-x.
                 15 w-byte-size-26.
                    20 w-byte-size-pic13 pic is 9(13) value is zeros comp-x.
                    20 w-byte-size-pic14 pic is 9(14) value is zeros comp-x.
                    20 w-byte-size-pic15 pic is 9(15) value is zeros comp-x.
                    20 w-byte-size-pic16 pic is 9(16) value is zeros comp-x.
              10 w-byte-sipic1v1  pic is 9V9      value is zeros comp.
              10 w-byte-sipic91v1 pic is 9(1)V9   value is zeros comp.
              10 w-byte-sipic1v91 pic is 9V9(1)   value is zeros comp.
              10 w-byte-size-pic92v99 pic is 9(02)V99 value is zeros comp.
              10 w-byte-size-pic97v93 pic is 9(7)V9(03) value is zeros comp.
              10 w-byte-size-pic999v93 pic is 999V9(03) value is zeros comp.
              10 w-byte-size-pic95v999 pic is 9(5)V999 value is zeros comp.
              10 w-byte-size-pic-s92v99 pic is s9(2)V99 value is zeros comp.
              10 w-byte-size-pic-s999v93 pic is s999V9(03) value is zeros comp.
              10 w-byte-size-pic-s95v999 pic is s9(5)V999 value is zeros comp.
              10 w-byte-size-pic-s97v93 pic is s9(7)V9(03) value is zeros comp.
              10 w-occdad.
                 15 w-occ                        occurs 12 times.
                    20 w-filho-occ pic is 9(05)                  comp-x.
           05 w-display.
              10 w-displayzzz999  pic is zzz999   value is zeros.
              10 w-displayzzzd999 pic is zzz.999  value is zeros.
              10 w-displayzzzc999 pic is zzz,999  value is zeros.
              10 w-display-99c99  pic is -99,99   value is zeros.
              10 w-display-9999   pic is -9999    value is zeros.
           05 w-pix10-no-value    pic is x(10).
           05 w-pix01-no-value     pic is x(01).
           05 w-pix1-no-value     pic is x.
           05 w-pi91-no-value     pic is 9.
           05 w-pi910-no-value    pic is 9(10).
      *>-> Testes com redefines
       01  w-var-sem-redefines    pic is x(20)    value is spaces.
       01  w-var-com-redefines    redefines w-var-sem-redefines pic is x(20).
       01  w-pai-de-redefines.
           05 w-primeira-filha-sem-redefines pic is x(30).
           05 w-redefines-primeira-filha redefines w-primeira-filha-sem-redefines.
           05 w-novo-redefines-primeira-filha redefines w-primeira-filha-sem-redefines.
           05 filler    redefines w-primeira-filha-sem-redefines.
              10 wfil-ven         pic is x(03)   occurs 10 times.
      *>--------------------------------------------- CALICM.cbl -----------------------------------------------------<*
