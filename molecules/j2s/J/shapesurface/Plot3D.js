Clazz.declarePackage("J.shapesurface");
Clazz.load(["J.shapesurface.Pmesh"], "J.shapesurface.Plot3D", null, function(){
var c$ = Clazz.declareType(J.shapesurface, "Plot3D", J.shapesurface.Pmesh);
Clazz.defineMethod(c$, "initShape", 
function(){
Clazz.superCall(this, J.shapesurface.Plot3D, "initShape", []);
this.myType = "plot3d";
});
});
;//5.0.1-v7 Sat Jun 06 18:16:07 CDT 2026
